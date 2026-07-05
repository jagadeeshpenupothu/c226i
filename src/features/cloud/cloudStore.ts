import type { CloudState } from "./cloudTypes";
import { INITIAL_SYNC_STATE, type SyncState } from "./sync/syncTypes";

// Reactive snapshot of everything cloud-related, consumed via hooks
// (useSyncExternalStore). Mirrors the observable-store pattern used elsewhere in
// the app. This store never becomes the source of truth for app data — it only
// reflects auth/sync/network status. Local databases remain authoritative.

const INITIAL_STATE: CloudState = {
  initialized: false,
  providerId: null,
  user: null,
  sync: INITIAL_SYNC_STATE,
  network: "unknown"
};

class CloudStore {
  private state: CloudState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): CloudState => this.state;

  update(patch: Partial<CloudState>): void {
    const next = { ...this.state, ...patch };
    if (shallowEqual(next, this.state)) return;
    this.state = next;
    this.emit();
  }

  patchSync(patch: Partial<SyncState>): void {
    const nextSync = { ...this.state.sync, ...patch };
    if (shallowEqual(nextSync, this.state.sync)) return;
    this.state = { ...this.state, sync: nextSync };
    this.emit();
  }

  reset(): void {
    this.state = INITIAL_STATE;
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

export const cloudStore = new CloudStore();
