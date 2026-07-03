import { FileText } from "lucide-react";
import type { PdfFile } from "@/features/pdf/types";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";
import { PdfDocumentOverview } from "./PdfDocumentOverview";
import { PdfErrorState } from "./PdfErrorState";
import { PdfLoadingState } from "./PdfLoadingState";

interface PdfPreviewProps {
  file: PdfFile | null;
  printPaper?: PrintPaperPreview | null;
  printerName?: string;
}

export function PdfPreview({ file, printPaper = null, printerName }: PdfPreviewProps) {
  const { document, pageCount, firstPage, fileSizeBytes, progress, isLoading, error } = usePdfDocument(file);

  if (!file) {
    return (
      <div className="flex h-full min-h-[520px] flex-col items-center justify-center rounded-lg border border-dashed border-[#48484A] bg-[#1C1D20]/82 px-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <FileText className="mb-5 h-12 w-12 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Drop a PDF</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          Choose or drop a PDF to review every page before printing.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-lg border border-[#3D3F43] bg-[#1C1D20]/82 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      {isLoading && <PdfLoadingState progress={progress} />}
      {error && !isLoading && <PdfErrorState reason={error} />}

      {document && firstPage && !isLoading && !error && (
        <PdfDocumentOverview
          file={file}
          document={document}
          pageCount={pageCount}
          firstPage={firstPage}
          fileSizeBytes={fileSizeBytes}
          printPaper={printPaper}
          printerName={printerName}
        />
      )}
    </div>
  );
}
