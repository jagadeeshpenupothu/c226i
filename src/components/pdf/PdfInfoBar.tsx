import type { PdfFile } from "@/features/pdf/types";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";
import { formatFileSize, formatMillimeters } from "@/services/pdf/pdfMetadata";
import type { PdfPageSize } from "@/types/pdf";

interface PdfInfoBarProps {
  file: PdfFile;
  pageCount: number;
  firstPage: PdfPageSize | null;
  fileSizeBytes: number | null;
  printPaper?: PrintPaperPreview | null;
}

export function PdfInfoBar({ file, pageCount, firstPage, fileSizeBytes, printPaper }: PdfInfoBarProps) {
  return (
    <div className="border-b border-[#48484A] bg-[#2C2C2E] px-4 py-3 text-white">
      <p className="truncate text-sm font-semibold">{file.name}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Pages: {pageCount || "..."}</span>
        {firstPage && (
          <>
            <span>Paper: {firstPage.paperSize}</span>
            <span>Orientation: {firstPage.orientation}</span>
            <span>
              {formatMillimeters(firstPage.widthMm)} x {formatMillimeters(firstPage.heightMm)} mm
            </span>
          </>
        )}
        <span>{formatFileSize(fileSizeBytes)}</span>
        {printPaper && (
          <span>
            Print: {printPaper.label}, printable area shown
          </span>
        )}
      </div>
    </div>
  );
}
