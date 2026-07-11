import type { CloudDocument, CloudDocumentLibrarySnapshot, CloudQuotaSnapshot, CloudReservationResult, PdfValidationResult } from "./documentTypes";

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
  uploadLocalPdf?(input: {
    documentId: string;
    path: string;
    byteSize: number;
    onProgress: (progress: number) => void;
  }): Promise<void>;
  finalizeUpload(input: {
    ownerUid: string;
    documentId: string;
    storagePath: string;
    sha256: string;
    byteSize: number;
  }): Promise<CloudDocument>;
  downloadToCache?(document: CloudDocument): Promise<PdfValidationResult>;
  getStatus?(ownerUid: string, documentId: string): Promise<{ document: CloudDocument; upload: { status: string } | null; quota: CloudQuotaSnapshot }>;
  abandonUpload?(ownerUid: string, documentId: string): Promise<void>;
  getDownloadUrl(document: CloudDocument): Promise<string>;
  markOpened(ownerUid: string, documentId: string): Promise<void>;
  deleteDocument(ownerUid: string, document: CloudDocument): Promise<void>;
}
