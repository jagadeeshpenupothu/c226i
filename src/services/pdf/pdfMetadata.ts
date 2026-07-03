import type { PDFDocumentProxy } from "pdfjs-dist";
import { safeInvoke } from "@/lib/tauri";
import type { PdfFile } from "@/features/pdf/types";
import type { PdfFileMetadata, PdfPageSize } from "@/types/pdf";

const POINTS_TO_MM = 25.4 / 72;

const PAPER_SIZES = [
  { name: "A3", width: 297, height: 420 },
  { name: "A4", width: 210, height: 297 },
  { name: "A5", width: 148, height: 210 },
  { name: "Letter", width: 216, height: 279 },
  { name: "Legal", width: 216, height: 356 }
];

export async function readPdfFileMetadata(file: PdfFile): Promise<PdfFileMetadata | null> {
  if (!file.path) return null;

  try {
    return await safeInvoke<PdfFileMetadata>("get_pdf_file_metadata", { path: file.path });
  } catch {
    return null;
  }
}

export async function readFirstPageSize(document: PDFDocumentProxy): Promise<PdfPageSize> {
  const firstPage = await document.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  return toPageSize(viewport.width, viewport.height);
}

export function toPageSize(widthPt: number, heightPt: number): PdfPageSize {
  const widthMm = widthPt * POINTS_TO_MM;
  const heightMm = heightPt * POINTS_TO_MM;
  const orientation = widthMm >= heightMm ? "Landscape" : "Portrait";

  return {
    widthPt,
    heightPt,
    widthMm,
    heightMm,
    orientation,
    paperSize: detectPaperSize(widthMm, heightMm)
  };
}

export function formatFileSize(bytes: number | null) {
  if (!bytes) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatMillimeters(value: number) {
  return Math.round(value).toLocaleString();
}

function detectPaperSize(widthMm: number, heightMm: number) {
  const shortSide = Math.min(widthMm, heightMm);
  const longSide = Math.max(widthMm, heightMm);
  const match = PAPER_SIZES.find((paper) => {
    const paperShort = Math.min(paper.width, paper.height);
    const paperLong = Math.max(paper.width, paper.height);
    return Math.abs(shortSide - paperShort) <= 4 && Math.abs(longSide - paperLong) <= 4;
  });

  return match?.name || "Custom";
}
