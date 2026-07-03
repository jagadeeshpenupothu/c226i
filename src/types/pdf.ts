import type { PDFDocumentProxy } from "pdfjs-dist";

export type ZoomMode = "fit-width" | "fit-page" | "actual" | "custom";

export interface PdfFileMetadata {
  fileSizeBytes: number;
}

export interface PdfPageSize {
  widthPt: number;
  heightPt: number;
  widthMm: number;
  heightMm: number;
  orientation: "Portrait" | "Landscape";
  paperSize: string;
}

export interface PdfDocumentState {
  document: PDFDocumentProxy | null;
  pageCount: number;
  firstPage: PdfPageSize | null;
  fileSizeBytes: number | null;
}

export interface PdfLoadProgress {
  loaded: number;
  total: number | null;
  percent: number | null;
}
