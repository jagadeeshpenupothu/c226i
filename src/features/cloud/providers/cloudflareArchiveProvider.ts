import { NotImplementedError, CloudAuthError } from "../cloudTypes";
import type { AuthenticationProvider } from "../auth/authProvider";
import type { SyncProvider } from "../sync/syncProvider";
import type { CloudDocumentProvider } from "../documents/cloudDocumentProvider";
import type { CloudDocument, CloudDocumentLibrarySnapshot, CloudQuotaSnapshot, CloudReservationResult } from "../documents/documentTypes";
import { downloadCloudflarePdfToCache, uploadCloudflarePdfPart } from "../documents/localDocumentBridge";
import type { SecureTokenStorage, StorageProvider } from "../storage/storageProvider";
import type { CloudProvider, CloudProviderMetadata } from "./cloudProvider";

const PART_SIZE_BYTES = 32 * 1024 * 1024;
const MAX_PART_RETRIES = 3;

export interface CloudflareArchiveConfig {
  workerBaseUrl: string;
}

interface WorkerDocument {
  documentId: string;
  ownerUid: string;
  sha256: string;
  storageKey?: string;
  storagePath?: string;
  originalFileName: string;
  displayName: string;
  contentType?: string;
  byteSize: number;
  pageCount: number | null;
  status: CloudDocument["status"] | "stored" | "ready";
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

interface WorkerQuota {
  used_bytes?: number;
  reserved_bytes?: number;
  quota_bytes?: number;
  usedBytes?: number;
  reservedBytes?: number;
  quotaBytes?: number;
}

function trimWorkerBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function mapQuota(input: WorkerQuota): CloudQuotaSnapshot {
  return {
    usedBytes: Number(input.used_bytes ?? input.usedBytes ?? 0),
    reservedBytes: Number(input.reserved_bytes ?? input.reservedBytes ?? 0),
    quotaBytes: Number(input.quota_bytes ?? input.quotaBytes ?? 0)
  };
}

function mapDocument(input: WorkerDocument): CloudDocument {
  const status = input.status === "stored" || input.status === "ready" ? "synced" : input.status;
  return {
    schemaVersion: 1,
    documentId: input.documentId,
    ownerUid: input.ownerUid,
    sha256: input.sha256,
    originalFileName: input.originalFileName,
    displayName: input.displayName,
    contentType: "application/pdf",
    byteSize: input.byteSize,
    pageCount: input.pageCount,
    storagePath: input.storageKey ?? input.storagePath ?? "",
    status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    lastOpenedAt: input.lastOpenedAt
  };
}

function idempotencyKey(input: { sha256: string; byteSize: number }): string {
  return `pdf:${input.sha256}:${input.byteSize}`;
}

class CloudflareArchiveDocumentProvider implements CloudDocumentProvider {
  private readonly workerBaseUrl: string;
  private readonly auth: AuthenticationProvider;

  constructor(config: CloudflareArchiveConfig, auth: AuthenticationProvider) {
    this.workerBaseUrl = trimWorkerBaseUrl(config.workerBaseUrl);
    this.auth = auth;
  }

  async listDocuments(): Promise<CloudDocumentLibrarySnapshot> {
    const body = await this.requestJson<{ documents: WorkerDocument[]; quota: WorkerQuota }>("/v1/documents");
    return {
      documents: body.documents.map(mapDocument),
      quota: mapQuota(body.quota)
    };
  }

  async getStorageUsage(): Promise<CloudQuotaSnapshot> {
    const body = await this.requestJson<{ quota: WorkerQuota }>("/v1/account/quota");
    return mapQuota(body.quota);
  }

  async reserveUpload(input: {
    sha256: string;
    originalFileName: string;
    displayName: string;
    byteSize: number;
    pageCount: number | null;
  }): Promise<CloudReservationResult> {
    const body = await this.requestJson<{
      duplicate: boolean;
      document: WorkerDocument;
      quota?: WorkerQuota;
    }>("/v1/archive/reserve", {
      method: "POST",
      body: JSON.stringify({
        sha256: input.sha256,
        originalFileName: input.originalFileName,
        displayName: input.displayName,
        byteSize: input.byteSize,
        pageCount: input.pageCount,
        idempotencyKey: idempotencyKey(input)
      })
    });
    const document = mapDocument(body.document);
    return {
      documentId: document.documentId,
      storagePath: document.storagePath,
      duplicate: body.duplicate,
      document,
      quota: body.quota ? mapQuota(body.quota) : undefined
    };
  }

  async uploadPdf(): Promise<void> {
    throw new NotImplementedError("Cloudflare browser Blob upload");
  }

  async uploadLocalPdf(input: {
    documentId: string;
    path: string;
    byteSize: number;
    onProgress: (progress: number) => void;
  }): Promise<void> {
    const initiated = await this.requestJson<{ upload: { status: string } }>(`/v1/archive/${input.documentId}/upload/initiate`, {
      method: "POST"
    });
    if (initiated.upload.status !== "active" && initiated.upload.status !== "completed") {
      throw new Error(`Unexpected upload state: ${initiated.upload.status}`);
    }
    if (initiated.upload.status === "completed") {
      input.onProgress(100);
      return;
    }

    const idToken = await this.requireIdToken();
    const parts: Array<{ partNumber: number; etag: string }> = [];
    const totalParts = Math.max(1, Math.ceil(input.byteSize / PART_SIZE_BYTES));
    for (let index = 0; index < totalParts; index += 1) {
      const partNumber = index + 1;
      const offset = index * PART_SIZE_BYTES;
      const byteSize = Math.min(PART_SIZE_BYTES, input.byteSize - offset);
      const part = await this.uploadPartWithRetry({
        idToken,
        documentId: input.documentId,
        path: input.path,
        partNumber,
        offset,
        byteSize
      });
      parts.push({ partNumber: part.partNumber, etag: part.etag });
      input.onProgress(Math.round((parts.length / totalParts) * 95));
    }

    await this.requestJson(`/v1/archive/${input.documentId}/upload/complete`, {
      method: "POST",
      body: JSON.stringify({ parts })
    });
    input.onProgress(100);
  }

  async finalizeUpload(input: { documentId: string }): Promise<CloudDocument> {
    const body = await this.requestJson<{ document: WorkerDocument }>(`/v1/archive/${input.documentId}/finalize`, {
      method: "POST"
    });
    return mapDocument(body.document);
  }

  async downloadToCache(document: CloudDocument) {
    return downloadCloudflarePdfToCache({
      workerBaseUrl: this.workerBaseUrl,
      idToken: await this.requireIdToken(),
      documentId: document.documentId,
      expectedSha256: document.sha256
    });
  }

  async getStatus(_ownerUid: string, documentId: string) {
    const body = await this.requestJson<{ document: WorkerDocument; upload: { status: string } | null; quota: WorkerQuota }>(`/v1/archive/${documentId}/status`);
    return {
      document: mapDocument(body.document),
      upload: body.upload,
      quota: mapQuota(body.quota)
    };
  }

  async abandonUpload(_ownerUid: string, documentId: string): Promise<void> {
    await this.requestJson(`/v1/archive/${documentId}/abandon`, { method: "POST" });
  }

  async getDownloadUrl(): Promise<string> {
    throw new NotImplementedError("Cloudflare temporary download URLs");
  }

  async markOpened(): Promise<void> {
    // The Worker does not expose a metadata-only open marker yet. Opening stays local.
  }

  async deleteDocument(_ownerUid: string, document: CloudDocument): Promise<void> {
    await this.requestJson(`/v1/archive/${document.documentId}`, { method: "DELETE" });
  }

  private async uploadPartWithRetry(input: {
    idToken: string;
    documentId: string;
    path: string;
    partNumber: number;
    offset: number;
    byteSize: number;
  }) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt += 1) {
      try {
        return await uploadCloudflarePdfPart({
          workerBaseUrl: this.workerBaseUrl,
          idToken: input.idToken,
          documentId: input.documentId,
          path: input.path,
          partNumber: input.partNumber,
          offset: input.offset,
          byteSize: input.byteSize
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.workerBaseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
        authorization: `Bearer ${await this.requireIdToken()}`
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Cloudflare archive request failed with ${response.status}`);
    }
    const body = await response.json();
    if (!body?.ok) throw new Error(body?.error || "Cloudflare archive request failed.");
    return body as T;
  }

  private async requireIdToken(): Promise<string> {
    const token = await this.auth.getIdToken(true);
    if (!token) throw new CloudAuthError("unauthenticated", "Sign in again to access Cloudflare archive.");
    return token;
  }
}

export class CloudflareArchiveProvider implements CloudProvider {
  readonly metadata: CloudProviderMetadata = {
    id: "cloudflare",
    label: "Cloudflare Archive",
    capabilities: { auth: true, sync: false, storage: true, realtime: false },
    configured: true
  };
  readonly auth: AuthenticationProvider;
  readonly sync: SyncProvider;
  readonly storage: StorageProvider;
  readonly documents: CloudDocumentProvider;
  readonly tokens: SecureTokenStorage;
  private readonly firebaseProvider: CloudProvider;

  constructor(firebaseProvider: CloudProvider, config: CloudflareArchiveConfig) {
    this.firebaseProvider = firebaseProvider;
    this.auth = firebaseProvider.auth;
    this.sync = firebaseProvider.sync;
    this.storage = firebaseProvider.storage;
    this.tokens = firebaseProvider.tokens;
    this.documents = new CloudflareArchiveDocumentProvider(config, firebaseProvider.auth);
  }

  async initialize(): Promise<void> {
    await this.firebaseProvider.initialize();
  }

  async dispose(): Promise<void> {
    await this.firebaseProvider.dispose();
  }

  isConfigured(): boolean {
    return true;
  }
}
