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

export async function uploadCloudflarePdfPart(input: {
  workerBaseUrl: string;
  idToken: string;
  documentId: string;
  path: string;
  partNumber: number;
  offset: number;
  byteSize: number;
}): Promise<{ partNumber: number; etag: string; byteSize: number }> {
  return safeInvoke("upload_cloudflare_pdf_part", input);
}

export async function downloadCloudflarePdfToCache(input: {
  workerBaseUrl: string;
  idToken: string;
  documentId: string;
  expectedSha256: string;
}): Promise<PdfValidationResult> {
  return safeInvoke<PdfValidationResult>("download_cloudflare_pdf_to_cache", input);
}

export async function removeCloudCachedPdf(documentId: string): Promise<void> {
  await safeInvoke<void>("remove_cloud_cached_pdf", { documentId });
}
