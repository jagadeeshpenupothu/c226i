// Synchronization — provider-agnostic types.

// Coarse lifecycle state surfaced to the UI (a status pill, etc.).
export type SyncStatus =
  | "online" // connected + provider ready, nothing pending
  | "offline" // no network, or no cloud provider / user (local-only)
  | "syncing" // actively pushing/pulling
  | "idle" // connected, nothing to do
  | "waiting" // pending operations, waiting to flush (debounce / backoff / paused)
  | "failed" // last attempt failed, will retry
  | "conflict"; // a conflict needs resolution

// The model the SYNC MODEL section asks for.
export interface SyncState {
  status: SyncStatus;
  lastSyncTime: string | null; // ISO
  pendingOperations: number;
  retryCount: number;
  paused: boolean;
}

export const INITIAL_SYNC_STATE: SyncState = {
  status: "offline",
  lastSyncTime: null,
  pendingOperations: 0,
  retryCount: 0,
  paused: false
};

// Which local entity a queued operation targets. Extend as cloud-backed
// entities are added.
export type SyncEntity = "profile" | "settings" | "job" | "printer" | "preferences";

// The kind of mutation — mirrors the local-first write that already happened.
export type SyncOperationType = "create" | "update" | "delete" | "rename" | "favorite";

export type SyncOperationStatus = "pending" | "inFlight" | "failed" | "conflict" | "done";

// One durable unit of intent: "this local change should eventually reach the
// cloud." Always created AFTER the local write succeeds (local-first). The
// payload carries the new local value (or a minimal diff) so a drain loop can
// replay it against the backend later.
export interface SyncOperation<TPayload = unknown> {
  id: string;
  entity: SyncEntity;
  entityId: string;
  type: SyncOperationType;
  payload: TPayload;
  baseVersion: number | null; // local version the change was based on (for conflict detection)
  createdAt: string; // ISO
  status: SyncOperationStatus;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
}
