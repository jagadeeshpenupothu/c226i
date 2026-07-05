import type { SyncEntity, SyncOperation, SyncOperationType } from "../sync/syncTypes";

// Durable, offline-first queue of pending cloud operations.
//
// Every future cloud write becomes a queued operation created AFTER the local
// write succeeds (local-first). The queue persists locally so intent survives
// restarts while offline. NOTHING drains it in this phase — draining arrives
// with the SyncProvider in a later phase. Persisting queued *operations* is not
// a security concern (it holds no credentials); auth tokens live only in
// SecureTokenStorage.

const STORAGE_KEY = "printpilot.cloud.syncQueue.v1";
const DEFAULT_MAX_RETRIES = 5;

export interface EnqueueInput<TPayload = unknown> {
  entity: SyncEntity;
  entityId: string;
  type: SyncOperationType;
  payload: TPayload;
  baseVersion?: number | null;
  maxRetries?: number;
}

let sequence = 0;
function newOperationId(): string {
  sequence += 1;
  return `op-${Date.now().toString(36)}-${sequence}`;
}

class SyncQueue {
  private operations: SyncOperation[] = [];
  private paused = false;
  private loaded = false;
  private snapshot: SyncOperation[] = [];
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SyncOperation[] => {
    this.ensureLoaded();
    return this.snapshot;
  };

  // --- mutations ---

  enqueue<TPayload = unknown>(input: EnqueueInput<TPayload>): SyncOperation<TPayload> {
    this.ensureLoaded();
    const operation: SyncOperation<TPayload> = {
      id: newOperationId(),
      entity: input.entity,
      entityId: input.entityId,
      type: input.type,
      payload: input.payload,
      baseVersion: input.baseVersion ?? null,
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
      maxRetries: input.maxRetries ?? DEFAULT_MAX_RETRIES,
      lastError: null
    };
    this.operations = [...this.operations, operation as SyncOperation];
    this.commit();
    return operation;
  }

  // The next operation a drain loop should attempt, or null when paused/empty.
  peekNext(): SyncOperation | null {
    this.ensureLoaded();
    if (this.paused) return null;
    return this.operations.find((operation) => operation.status === "pending") ?? null;
  }

  markInFlight(id: string): void {
    this.patch(id, { status: "inFlight" });
  }

  markDone(id: string): void {
    this.ensureLoaded();
    this.operations = this.operations.filter((operation) => operation.id !== id);
    this.commit();
  }

  // Records a failure and schedules a retry until maxRetries is exhausted, after
  // which the operation stays "failed" as a dead-letter for manual retry.
  markFailed(id: string, error: string): void {
    this.ensureLoaded();
    this.operations = this.operations.map((operation) => {
      if (operation.id !== id) return operation;
      const retryCount = operation.retryCount + 1;
      return {
        ...operation,
        retryCount,
        lastError: error,
        status: retryCount > operation.maxRetries ? "failed" : "pending"
      };
    });
    this.commit();
  }

  markConflict(id: string): void {
    this.patch(id, { status: "conflict" });
  }

  // Reset a failed/conflicted operation back to pending (manual retry).
  retry(id: string): void {
    this.patch(id, { status: "pending", lastError: null });
  }

  retryAll(): void {
    this.ensureLoaded();
    this.operations = this.operations.map((operation) =>
      operation.status === "failed" || operation.status === "conflict"
        ? { ...operation, status: "pending", lastError: null }
        : operation
    );
    this.commit();
  }

  remove(id: string): void {
    this.markDone(id);
  }

  clear(): void {
    this.ensureLoaded();
    if (this.operations.length === 0) return;
    this.operations = [];
    this.commit();
  }

  // --- pause / resume ---

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.commit();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.commit();
  }

  isPaused(): boolean {
    return this.paused;
  }

  // --- reads ---

  getPending(): SyncOperation[] {
    this.ensureLoaded();
    return this.operations.filter((operation) => operation.status === "pending" || operation.status === "inFlight");
  }

  pendingCount(): number {
    return this.getPending().length;
  }

  getAll(): SyncOperation[] {
    return this.getSnapshot();
  }

  // --- internals ---

  private patch(id: string, changes: Partial<SyncOperation>): void {
    this.ensureLoaded();
    this.operations = this.operations.map((operation) => (operation.id === id ? { ...operation, ...changes } : operation));
    this.commit();
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SyncOperation[];
        if (Array.isArray(parsed)) this.operations = parsed;
      }
    } catch {
      this.operations = [];
    }
    this.snapshot = [...this.operations];
  }

  private commit(): void {
    this.snapshot = [...this.operations];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.operations));
    } catch {
      // Persistence is best-effort; the in-memory queue remains authoritative.
    }
    this.listeners.forEach((listener) => listener());
  }
}

export const syncQueue = new SyncQueue();
