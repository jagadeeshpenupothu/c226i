import { convertFileSrc } from "@tauri-apps/api/core";
import { cloudManager } from "../cloudManager";
import type { CloudUser } from "../cloudTypes";
import type { CloudDocument, CurrentDocumentCloudState, DocumentOrigin } from "./documentTypes";
import { downloadCloudPdfToCache, validatePdfForCloud } from "./localDocumentBridge";

type Listener = () => void;

class CloudDocumentService {
  private listeners = new Set<Listener>();
  private current: CurrentDocumentCloudState | null = null;
  private lastArchiveInput: { path: string; fileName: string; pageCount: number | null; userId: string } | null = null;

  getSnapshot = (): CurrentDocumentCloudState | null => this.current;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  archiveAuthenticatedLocalPdf(input: {
    path: string;
    fileName: string;
    pageCount: number | null;
    user: CloudUser | null;
    origin: DocumentOrigin;
  }): void {
    if (!input.user || input.origin !== "authenticated-local-import") return;
    this.lastArchiveInput = { path: input.path, fileName: input.fileName, pageCount: input.pageCount, userId: input.user.id };
    void this.runArchive(input.path, input.fileName, input.pageCount);
  }

  retry(): void {
    const input = this.lastArchiveInput;
    if (!input) return;
    void this.runArchive(input.path, input.fileName, input.pageCount, true);
  }

  async openCloudDocument(document: CloudDocument): Promise<{ path: string; previewUrl: string }> {
    const urlResult = await cloudManager.getCloudDocumentDownloadUrl(document);
    if (!urlResult.ok) throw new Error(urlResult.error.message);
    const cached = await downloadCloudPdfToCache(document.documentId, urlResult.value, document.sha256);
    await cloudManager.markCloudDocumentOpened(document.documentId);
    return { path: cached.path, previewUrl: convertFileSrc(cached.path) };
  }

  private async runArchive(path: string, fileName: string, pageCount: number | null, retrying = false): Promise<void> {
    try {
      this.setState(path, retrying ? "retrying" : "validating", null, null, null, false);
      await Promise.resolve();
      this.setState(path, "hashing", null, null, null, false);
      const validation = await validatePdfForCloud(path);
      this.setState(path, "checkingDuplicate", null, null, null, false);
      await Promise.resolve();
      this.setState(path, "reservingQuota", null, null, null, false);
      const reservation = await cloudManager.reserveCloudUpload({
        sha256: validation.sha256,
        originalFileName: fileName,
        displayName: fileName,
        byteSize: validation.byteSize,
        pageCount
      });
      if (!reservation.ok) {
        const isQuota = reservation.error.message.toLowerCase().includes("quota");
        this.setState(path, isQuota ? "quotaExceeded" : "failed", null, null, reservation.error.message, true);
        return;
      }
      if (reservation.value.duplicate) {
        this.setState(path, "duplicate", 100, reservation.value.documentId, "Already in Cloud", false);
        return;
      }

      this.setState(path, "uploading", 0, reservation.value.documentId, null, false);
      const blob = await fetch(convertFileSrc(path)).then((response) => response.blob());
      const upload = await cloudManager.uploadCloudPdf({
        storagePath: reservation.value.storagePath,
        file: blob,
        onProgress: (progress) => this.setState(path, "uploading", progress, reservation.value.documentId, null, false)
      });
      if (!upload.ok) {
        this.setState(path, "failed", null, reservation.value.documentId, upload.error.message, true);
        return;
      }

      this.setState(path, "finalizing", 100, reservation.value.documentId, null, false);
      const finalized = await cloudManager.finalizeCloudUpload({
        documentId: reservation.value.documentId,
        storagePath: reservation.value.storagePath,
        sha256: validation.sha256,
        byteSize: validation.byteSize
      });
      if (!finalized.ok) {
        this.setState(path, "failed", null, reservation.value.documentId, finalized.error.message, true);
        return;
      }
      this.setState(path, "synced", 100, finalized.value.documentId, "Saved to Cloud", false);
    } catch (error) {
      this.setState(path, "failed", null, null, error instanceof Error ? error.message : String(error), true);
    }
  }

  private setState(
    localPath: string,
    state: CurrentDocumentCloudState["state"],
    progress: number | null,
    documentId: string | null,
    message: string | null,
    retryable: boolean
  ): void {
    this.current = {
      localPath,
      origin: "authenticated-local-import",
      state,
      progress,
      documentId,
      message,
      retryable,
      updatedAt: new Date().toISOString()
    };
    this.listeners.forEach((listener) => listener());
  }
}

export const cloudDocumentService = new CloudDocumentService();
