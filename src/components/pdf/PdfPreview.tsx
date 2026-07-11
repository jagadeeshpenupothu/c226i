import { useEffect, useState } from "react";
import { Clock, FileUp, MousePointerSquareDashed } from "lucide-react";
import { defaultPrintLayout, type PrintLayout } from "@/features/layout/types";
import type { PdfFile } from "@/features/pdf/types";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";
import { Button } from "@/components/ui/button";
import { PdfDetailPreview } from "./PdfDetailPreview";
import { PdfDocumentOverview } from "./PdfDocumentOverview";
import { PdfErrorState } from "./PdfErrorState";
import { PdfLoadingState } from "./PdfLoadingState";

interface PdfPreviewProps {
  file: PdfFile | null;
  printPaper?: PrintPaperPreview | null;
  // Defaulted so an incremental hot-reload (or any caller) can never render the
  // preview with an undefined layout — the crash that produced the white screen.
  layout?: PrintLayout;
  printerName?: string;
  recentFiles?: { path: string; name: string }[];
  onBrowse?: () => void;
  onOpenRecent?: (path: string) => void;
  /** Reports the loaded document's page count (0 when none) for the header. */
  onPageCount?: (pageCount: number) => void;
  onCurrentPageChange?: (page: number) => void;
}

export function PdfPreview({ file, printPaper = null, layout = defaultPrintLayout, printerName, recentFiles, onBrowse, onOpenRecent, onPageCount, onCurrentPageChange }: PdfPreviewProps) {
  const { document, pageCount, firstPage, fileSizeBytes, progress, isLoading, error } = usePdfDocument(file);
  const documentIdentity = file?.path || file?.previewUrl || "pdf";
  // `null` shows the document overview (thumbnail grid); a page number opens the
  // detailed page viewer at that page.
  const [detailPage, setDetailPage] = useState<number | null>(null);

  // Surface the page count to the shell header. `onPageCount` should be a stable
  // setter (it is — React state setters never change identity).
  useEffect(() => {
    onPageCount?.(document ? pageCount : 0);
  }, [document, pageCount, onPageCount]);
  useEffect(() => {
    onCurrentPageChange?.(detailPage || 1);
  }, [detailPage, onCurrentPageChange]);

  // A newly loaded document always starts on the overview.
  useEffect(() => {
    setDetailPage(null);
  }, [file]);

  if (!file) {
    return (
      <div className="flex h-full min-h-[520px] flex-col items-center justify-center rounded-lg border border-dashed border-[#48484A] bg-[#1C1D20]/82 px-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
          <MousePointerSquareDashed className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-white">Open a PDF to begin</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Drag a PDF anywhere in this window, or browse for one. You can review every page and dial in the exact printed
          layout before a printer is even connected.
        </p>
        {onBrowse && (
          <Button className="mt-6 h-10 rounded-md px-5" onClick={onBrowse}>
            <FileUp className="h-4 w-4" />
            Browse PDF
          </Button>
        )}
        {recentFiles && recentFiles.length > 0 && onOpenRecent && (
          <div className="mt-8 w-full max-w-sm text-left">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[#8A8C92]">
              <Clock className="h-3.5 w-3.5" />
              Recent
            </p>
            <div className="grid gap-1">
              {recentFiles.slice(0, 6).map((item) => (
                <button
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[#D7D8DD] transition hover:bg-white/5"
                  key={item.path}
                  onClick={() => onOpenRecent(item.path)}
                  type="button"
                >
                  <FileUp className="h-4 w-4 shrink-0 rotate-180 text-red-400" />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-lg border border-[#3D3F43] bg-[#1C1D20]/82 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      {isLoading && <PdfLoadingState progress={progress} />}
      {error && !isLoading && <PdfErrorState reason={error} />}

      {document && firstPage && !isLoading && !error &&
        (detailPage === null ? (
          <PdfDocumentOverview
            file={file}
            documentIdentity={documentIdentity}
            document={document}
            pageCount={pageCount}
            firstPage={firstPage}
            fileSizeBytes={fileSizeBytes}
            printPaper={printPaper}
            layout={layout}
            printerName={printerName}
            onOpenPage={(page) => {
              onCurrentPageChange?.(page);
              setDetailPage(page);
            }}
          />
        ) : (
          <PdfDetailPreview
            file={file}
            document={document}
            pageCount={pageCount}
            firstPage={firstPage}
            fileSizeBytes={fileSizeBytes}
            printPaper={printPaper}
            layout={layout}
            initialPage={detailPage}
            onBack={() => setDetailPage(null)}
            onCurrentPageChange={onCurrentPageChange}
          />
        ))}
    </div>
  );
}
