import type { SyncEntity, SyncOperation } from "./syncTypes";

// How a cloud backend applies queued operations and streams remote changes.
// Implemented by a concrete provider (Firestore, etc.) in a later phase; stubbed
// today. The queue calls push(); reconciliation calls pull(); realtime uses
// subscribe(). None of these ever overwrite local state directly — local stays
// the source of truth and the ConflictResolver mediates divergence.
export interface SyncProvider {
  // Replay a batch of already-local operations to the cloud. Returns a per-op
  // result so the queue can mark done / retry / flag conflicts.
  push(operations: SyncOperation[]): Promise<SyncPushResult[]>;

  // Fetch the authoritative remote state for an entity (for reconciliation).
  pull(entity: SyncEntity): Promise<SyncPullResult>;

  // Realtime subscription (Firestore listeners, etc.) — future. Returns an
  // unsubscribe function.
  subscribe(entity: SyncEntity, listener: (change: RemoteChange) => void): () => void;
}

export interface SyncPushResult {
  operationId: string;
  outcome: "applied" | "conflict" | "rejected";
  remoteVersion: number | null;
  message?: string;
}

export interface RemoteDocument {
  entityId: string;
  version: number;
  data: unknown;
  updatedAt: string; // ISO
}

export interface SyncPullResult {
  entity: SyncEntity;
  documents: RemoteDocument[];
}

export interface RemoteChange {
  entityId: string;
  version: number;
  data: unknown;
  type: "upsert" | "delete";
}
