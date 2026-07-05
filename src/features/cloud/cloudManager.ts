import { cloudStore } from "./cloudStore";
import { toCloudError, type CloudResult, type CloudUser } from "./cloudTypes";
import { DefaultConflictResolver, type ConflictResolver, type ConflictStrategy } from "./conflict/conflictResolver";
import { networkMonitor, type NetworkStatus } from "./network/networkMonitor";
import { syncQueue, type EnqueueInput } from "./queue/syncQueue";
import type { CloudProvider } from "./providers/cloudProvider";
import type { AuthMethod } from "./auth/authTypes";
import type { SyncOperation, SyncStatus } from "./sync/syncTypes";

// The single orchestration surface the app uses for anything cloud-related.
//
// Business logic NEVER imports a provider directly — it calls cloudManager,
// which delegates to whichever CloudProvider is registered. In this phase no
// provider is registered by default, so the app runs fully local/offline and
// every cloud call is a safe no-op that returns a typed "not-configured"
// result (it never throws into business logic).
//
// LOCAL-FIRST CONTRACT: `recordChange()` is called AFTER a local write has
// already succeeded. The manager only records the intent to sync; it never
// gates or mutates the local write, and the cloud never becomes the source of
// truth.
class CloudManager {
  private provider: CloudProvider | null = null;
  private conflictResolver: ConflictResolver = new DefaultConflictResolver("lastWriteWins");
  private unsubscribeNetwork: (() => void) | null = null;
  private unsubscribeQueue: (() => void) | null = null;
  private unsubscribeAuth: (() => void) | null = null;
  private initialized = false;

  // --- lifecycle ------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    networkMonitor.start();
    this.unsubscribeNetwork = networkMonitor.subscribe((status) => this.onNetworkChange(status));
    this.unsubscribeQueue = syncQueue.subscribe(() => this.refreshSyncSnapshot());

    if (this.provider) {
      try {
        await this.provider.initialize();
      } catch {
        // A stub/unconfigured provider must never break app startup.
      }
      // React to auth changes (sign-in/out, session restore, token expiry) from
      // whichever provider is registered — the store is the single reactive
      // source the UI reads. The manager never learns this is Firebase.
      this.unsubscribeAuth = this.provider.auth.onAuthStateChanged((user) => {
        cloudStore.update({ user });
        this.refreshSyncSnapshot();
      });
      // Silent session restore — surfaces a previously-signed-in user if the
      // provider can restore one (no popup). Best-effort; never blocks startup.
      try {
        const restored = await this.provider.auth.getCurrentUser();
        if (restored) cloudStore.update({ user: restored });
      } catch {
        // ignore — the app stays local-only until an interactive sign-in
      }
    }

    cloudStore.update({
      initialized: true,
      providerId: this.provider?.metadata.id ?? null,
      network: networkMonitor.getStatus()
    });
    this.refreshSyncSnapshot();
  }

  async dispose(): Promise<void> {
    this.unsubscribeNetwork?.();
    this.unsubscribeNetwork = null;
    this.unsubscribeQueue?.();
    this.unsubscribeQueue = null;
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    networkMonitor.stop();
    if (this.provider) {
      try {
        await this.provider.dispose();
      } catch {
        // ignore
      }
    }
    this.initialized = false;
  }

  // --- provider registration ------------------------------------------------
  // Phase 9 registers a configured FirebaseProvider here. Everything downstream
  // is unchanged.

  registerProvider(provider: CloudProvider): void {
    this.provider = provider;
    cloudStore.update({ providerId: provider.metadata.id });
    this.refreshSyncSnapshot();
  }

  getProvider(): CloudProvider | null {
    return this.provider;
  }

  hasProvider(): boolean {
    return this.provider !== null && this.provider.isConfigured();
  }

  // --- auth (delegation; safe when no provider is configured) ----------------

  async signIn(method: AuthMethod): Promise<CloudResult<CloudUser>> {
    if (!this.provider) return { ok: false, error: { code: "not-configured", message: "No cloud provider registered." } };
    try {
      const user = await this.provider.auth.signIn(method);
      cloudStore.update({ user });
      this.refreshSyncSnapshot();
      return { ok: true, value: user };
    } catch (error) {
      return { ok: false, error: toCloudError(error) };
    }
  }

  async signOut(): Promise<CloudResult<void>> {
    if (!this.provider) {
      cloudStore.update({ user: null });
      return { ok: true, value: undefined };
    }
    try {
      await this.provider.auth.signOut();
      cloudStore.update({ user: null });
      this.refreshSyncSnapshot();
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: toCloudError(error) };
    }
  }

  // --- local-first sync intent ----------------------------------------------

  // Called AFTER a local write succeeds. Enqueues the change for eventual cloud
  // sync and returns immediately. In this phase nothing drains the queue, so the
  // op simply persists locally — the app behaves exactly as before.
  recordChange(input: EnqueueInput): SyncOperation {
    const operation = syncQueue.enqueue(input);
    this.refreshSyncSnapshot();
    return operation;
  }

  pauseSync(): void {
    syncQueue.pause();
    this.refreshSyncSnapshot();
  }

  resumeSync(): void {
    syncQueue.resume();
    this.refreshSyncSnapshot();
  }

  // --- conflict strategy ----------------------------------------------------

  setConflictStrategy(strategy: ConflictStrategy): void {
    this.conflictResolver = new DefaultConflictResolver(strategy);
  }

  getConflictResolver(): ConflictResolver {
    return this.conflictResolver;
  }

  // --- internals ------------------------------------------------------------

  private onNetworkChange(status: NetworkStatus): void {
    cloudStore.update({ network: status });
    this.refreshSyncSnapshot();
  }

  private refreshSyncSnapshot(): void {
    const pending = syncQueue.pendingCount();
    cloudStore.patchSync({
      status: this.computeStatus(pending),
      pendingOperations: pending,
      paused: syncQueue.isPaused()
    });
  }

  // Derives the coarse sync status. Without a configured provider or a signed-in
  // user, the cloud is simply "offline" from the app's perspective. "syncing" /
  // "failed" / "conflict" are set by the (future) drain loop.
  private computeStatus(pending: number): SyncStatus {
    const { user } = cloudStore.getSnapshot();
    if (!this.hasProvider() || !user) return "offline";
    if (!networkMonitor.isOnline()) return "offline";
    if (syncQueue.isPaused()) return "waiting";
    if (pending > 0) return "waiting";
    return "idle";
  }
}

export const cloudManager = new CloudManager();
