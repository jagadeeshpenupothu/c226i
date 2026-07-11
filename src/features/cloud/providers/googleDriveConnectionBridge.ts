import { safeInvoke } from "@/lib/tauri";
import type { CloudDocument, CloudDocumentLibrarySnapshot, PdfValidationResult } from "../documents/documentTypes";

export interface GoogleDriveConnectionConfig {
  oauthClientId: string;
  sharedDriveId: string;
}

export interface GoogleDriveConnectionState {
  connected: boolean;
  sharedDriveId: string;
  usersFolderId: string | null;
  userFolderId: string | null;
  pdfsFolderId: string | null;
}

export interface GoogleDriveArchivePdfResponse {
  status: "uploaded" | "duplicate";
  fileId: string;
  sha256: string;
  byteSize: number;
  usedBytes: number;
  quotaBytes: number;
}

interface GoogleDriveConnectionRequest extends GoogleDriveConnectionConfig {
  firebaseUid: string;
}

interface GoogleDriveDocumentRequest extends GoogleDriveConnectionRequest {
  documentId: string;
  expectedSha256?: string;
  expectedByteSize?: number;
}

interface GoogleDriveDocument {
  documentId: string;
  ownerUid: string;
  sha256: string;
  originalFileName: string;
  displayName: string;
  byteSize: number;
  pageCount: number | null;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export function readGoogleDriveConnectionConfig(): GoogleDriveConnectionConfig | null {
  const oauthClientId = import.meta.env.VITE_GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim();
  const sharedDriveId = import.meta.env.VITE_GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim();
  if (!oauthClientId || !sharedDriveId) return null;
  return { oauthClientId, sharedDriveId };
}

function request(firebaseUid: string, config: GoogleDriveConnectionConfig): GoogleDriveConnectionRequest {
  return {
    firebaseUid,
    oauthClientId: config.oauthClientId,
    sharedDriveId: config.sharedDriveId
  };
}

export function connectGoogleDrive(
  firebaseUid: string,
  config: GoogleDriveConnectionConfig
): Promise<GoogleDriveConnectionState> {
  return safeInvoke("connect_google_drive", { request: request(firebaseUid, config) });
}

export function getGoogleDriveConnectionState(
  firebaseUid: string,
  config: GoogleDriveConnectionConfig
): Promise<GoogleDriveConnectionState> {
  return safeInvoke("get_google_drive_connection_state", {
    request: request(firebaseUid, config)
  });
}

export function disconnectGoogleDrive(
  firebaseUid: string,
  config: GoogleDriveConnectionConfig
): Promise<GoogleDriveConnectionState> {
  return safeInvoke("disconnect_google_drive", {
    request: request(firebaseUid, config)
  });
}

export function archiveGoogleDrivePdf(input: {
  firebaseUid: string;
  config: GoogleDriveConnectionConfig;
  path: string;
  originalFileName: string;
  displayName: string;
  pageCount: number | null;
}): Promise<GoogleDriveArchivePdfResponse> {
  return safeInvoke("archive_google_drive_pdf", {
    request: {
      ...request(input.firebaseUid, input.config),
      path: input.path,
      originalFileName: input.originalFileName,
      displayName: input.displayName,
      pageCount: input.pageCount
    }
  });
}

export async function listGoogleDriveDocuments(firebaseUid: string, config: GoogleDriveConnectionConfig): Promise<CloudDocumentLibrarySnapshot> {
  const response = await safeInvoke<{
    documents: GoogleDriveDocument[];
    quota: { usedBytes: number; reservedBytes: number; quotaBytes: number };
  }>("list_google_drive_documents", { request: request(firebaseUid, config) });
  return {
    documents: response.documents.map(mapGoogleDriveDocument),
    quota: response.quota
  };
}

export function downloadGoogleDrivePdfToCache(input: {
  firebaseUid: string;
  config: GoogleDriveConnectionConfig;
  document: CloudDocument;
}): Promise<PdfValidationResult> {
  return safeInvoke<PdfValidationResult>("download_google_drive_pdf_to_cache", {
    request: documentRequest(input.firebaseUid, input.config, input.document)
  });
}

export async function trashGoogleDriveDocument(input: {
  firebaseUid: string;
  config: GoogleDriveConnectionConfig;
  document: CloudDocument;
}): Promise<void> {
  await safeInvoke<void>("trash_google_drive_document", {
    request: documentRequest(input.firebaseUid, input.config, input.document)
  });
}

function documentRequest(firebaseUid: string, config: GoogleDriveConnectionConfig, document: CloudDocument): GoogleDriveDocumentRequest {
  return {
    ...request(firebaseUid, config),
    documentId: document.documentId,
    expectedSha256: document.sha256,
    expectedByteSize: document.byteSize
  };
}

function mapGoogleDriveDocument(document: GoogleDriveDocument): CloudDocument {
  return {
    schemaVersion: 1,
    documentId: document.documentId,
    ownerUid: document.ownerUid,
    sha256: document.sha256,
    originalFileName: document.originalFileName,
    displayName: document.displayName,
    contentType: "application/pdf",
    byteSize: document.byteSize,
    pageCount: document.pageCount,
    storagePath: document.storagePath,
    status: "synced",
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    lastOpenedAt: document.lastOpenedAt
  };
}
