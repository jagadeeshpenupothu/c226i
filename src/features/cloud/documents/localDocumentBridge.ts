import { convertFileSrc } from "@tauri-apps/api/core";
import { safeInvoke } from "@/lib/tauri";
import type { PdfFile } from "@/features/pdf/types";
import type { DocumentOrigin, PdfValidationResult } from "./documentTypes";

export function fileNameFromCloudPath(path: string): string {
  return path.split(/[\\/]/).pop() || "Document.pdf";
}

export function createPdfFile(path: string, origin: DocumentOrigin, cloudDocumentId?: string): PdfFile {
  return {
    name: fileNameFromCloudPath(path),
    path,
    previewUrl: convertFileSrc(path),
    origin,
    cloudDocumentId
  };
}

export async function validatePdfForCloud(path: string): Promise<PdfValidationResult> {
  return safeInvoke<PdfValidationResult>("validate_pdf_for_cloud", { path });
}

export async function resolveCloudPdfCachePath(documentId: string): Promise<string> {
  return safeInvoke<string>("resolve_cloud_pdf_cache_path", { documentId });
}

export async function downloadCloudPdfToCache(documentId: string, downloadUrl: string, expectedSha256: string): Promise<PdfValidationResult> {
  return safeInvoke<PdfValidationResult>("download_cloud_pdf_to_cache", {
    documentId,
    downloadUrl,
    expectedSha256
  });
}

export async function removeCloudCachedPdf(documentId: string): Promise<void> {
  await safeInvoke<void>("remove_cloud_cached_pdf", { documentId });
}
