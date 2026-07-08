export type DocumentOrigin = "guest-local-import" | "authenticated-local-import" | "cloud-library-download" | "app-cache-reopen";

export type CloudArchiveState =
  | "localReady"
  | "validating"
  | "hashing"
  | "checkingDuplicate"
  | "reservingQuota"
  | "uploading"
  | "finalizing"
  | "synced"
  | "failed"
  | "retrying"
  | "cancelled"
  | "quotaExceeded"
  | "duplicate";

export interface PdfValidationResult {
  path: string;
  byteSize: number;
  sha256: string;
  isPdf: boolean;
}

export interface CurrentDocumentCloudState {
  localPath: string;
  origin: DocumentOrigin;
  state: CloudArchiveState;
  progress: number | null;
  documentId: string | null;
  message: string | null;
  retryable: boolean;
  updatedAt: string;
}

export interface CloudDocument {
  schemaVersion: number;
  documentId: string;
  ownerUid: string;
  sha256: string;
  originalFileName: string;
  displayName: string;
  contentType: "application/pdf";
  byteSize: number;
  pageCount: number | null;
  storagePath: string;
  status: "reserved" | "uploading" | "synced" | "failed" | "deleting";
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface CloudQuotaSnapshot {
  usedBytes: number;
  quotaBytes: number;
  reservedBytes: number;
}

export interface CloudDocumentLibrarySnapshot {
  documents: CloudDocument[];
  quota: CloudQuotaSnapshot;
}

export interface CloudReservationResult {
  documentId: string;
  storagePath: string;
  duplicate: boolean;
  document?: CloudDocument;
  quota?: CloudQuotaSnapshot;
}

export interface GuestHistoryItem {
  schemaVersion: number;
  historyId: string;
  displayName: string;
  originalFileName: string;
  localPath: string;
  byteSize: number;
  pageCount: number | null;
  createdAt: string;
  lastOpenedAt: string;
}
