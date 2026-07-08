import type { CloudDocument, CloudDocumentLibrarySnapshot, CloudQuotaSnapshot, CloudReservationResult } from "./documentTypes";

export interface CloudDocumentProvider {
  listDocuments(ownerUid: string): Promise<CloudDocumentLibrarySnapshot>;
  getStorageUsage(ownerUid: string): Promise<CloudQuotaSnapshot>;
  reserveUpload(input: {
    ownerUid: string;
    sha256: string;
    originalFileName: string;
    displayName: string;
    byteSize: number;
    pageCount: number | null;
  }): Promise<CloudReservationResult>;
  uploadPdf(input: {
    storagePath: string;
    file: Blob;
    onProgress: (progress: number) => void;
  }): Promise<void>;
  finalizeUpload(input: {
    ownerUid: string;
    documentId: string;
    storagePath: string;
    sha256: string;
    byteSize: number;
  }): Promise<CloudDocument>;
  getDownloadUrl(document: CloudDocument): Promise<string>;
  markOpened(ownerUid: string, documentId: string): Promise<void>;
  deleteDocument(ownerUid: string, document: CloudDocument): Promise<void>;
}
