import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { describePrintLayout, type PrintLayout } from "@/features/layout/types";
import type { PdfFile } from "@/features/pdf/types";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";
import { formatFileSize } from "@/services/pdf/pdfMetadata";
import type { PdfPageSize } from "@/types/pdf";
import { PdfOverviewThumbnail } from "./PdfOverviewThumbnail";

interface PdfDocumentOverviewProps {
  file: PdfFile;
  documentIdentity: string;
  document: PDFDocumentProxy;
  pageCount: number;
  firstPage: PdfPageSize;
  fileSizeBytes: number | null;
  printPaper: PrintPaperPreview | null;
  layout: PrintLayout;
  printerName?: string;
  onOpenPage: (pageNumber: number) => void;
}

const MIN_PAGES_PER_ROW = 2;
const MAX_PAGES_PER_ROW = 10;

export function PdfDocumentOverview({
  file,
  documentIdentity,
  document,
  pageCount,
  firstPage,
  fileSizeBytes,
  printPaper,
  layout,
  printerName,
  onOpenPage
}: PdfDocumentOverviewProps) {
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [selectedPage, setSelectedPage] = useState(1);
  const [search, setSearch] = useState("1");
  const [pagesPerRow, setPagesPerRow] = useState(5);
  const fallbackPage = { widthPt: firstPage.widthPt, heightPt: firstPage.heightPt };
  const documentDetails = [
    `${pageCount} ${pageCount === 1 ? "Page" : "Pages"}`,
    `${firstPage.paperSize} ${firstPage.orientation}`,
    formatFileSize(fileSizeBytes),
    `Printer: ${printerName || "Not connected"}`,
    `Paper: ${printPaper?.label || "Document size"}`
  ];

  useEffect(() => {
    pageRefs.current[selectedPage]?.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  }, [selectedPage, pagesPerRow]);

  function goToPage(nextPage: number) {
    const page = Math.min(pageCount, Math.max(1, nextPage));
    setSelectedPage(page);
    setSearch(String(page));
  }

  function jumpToPage(value: string) {
    setSearch(value);
    const page = Number(value.replace(/\D/g, ""));
    if (!page || page < 1 || page > pageCount) return;
    setSelectedPage(page);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/10 px-3 pb-3 pt-3 md:px-4 md:pb-4 md:pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 grid h-9 w-8 shrink-0 place-items-center rounded-md bg-white text-red-600 shadow-lg md:h-10 md:w-9">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white md:text-lg">{file.name}</h2>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#B9BABE]">
                {documentDetails.map((detail) => (
                  <span className="after:ml-3 after:text-[#777A80] after:content-['•'] last:after:content-none" key={detail}>
                    {detail}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 text-sm text-[#C4C5CA] md:gap-2">
            <label className="flex items-center gap-2">
              <span className="hidden sm:inline">Search Page</span>
              <input
                className="h-8 w-12 rounded-md border border-white/10 bg-white/5 px-2 text-center text-white outline-none focus:ring-2 focus:ring-primary"
                value={search}
                onChange={(event) => jumpToPage(event.target.value)}
              />
            </label>
            <span>/ {pageCount}</span>
            <button
              aria-label="Previous page"
              className="grid h-8 w-8 place-items-center rounded-md bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-40"
              disabled={selectedPage <= 1}
              onClick={() => goToPage(selectedPage - 1)}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label="Next page"
              className="grid h-8 w-8 place-items-center rounded-md bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-40"
              disabled={selectedPage >= pageCount}
              onClick={() => goToPage(selectedPage + 1)}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/10 px-3 py-2 md:px-4 md:py-2.5">
        <p className="truncate text-xs font-medium text-sky-300/90">
          Print layout: <span className="text-[#D7D8DD]">{describePrintLayout(layout)}</span>
        </p>
        <span className="shrink-0 text-[11px] text-[#8A8C92]">Click a page to open the sheet preview</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-4 md:px-5 md:py-6">
        <div
          className="grid items-start gap-x-3 gap-y-4 transition-[grid-template-columns] duration-200 ease-out md:gap-x-4 md:gap-y-5"
          style={{ gridTemplateColumns: `repeat(${pagesPerRow}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: pageCount }, (_, index) => {
            const pageNumber = index + 1;
            return (
              <div
                key={pageNumber}
                ref={(node) => {
                  pageRefs.current[pageNumber] = node;
                }}
              >
                <PdfOverviewThumbnail
                  documentIdentity={documentIdentity}
                  document={document}
                  isSelected={selectedPage === pageNumber}
                  isVisible
                  pageNumber={pageNumber}
                  printPaper={printPaper}
                  fallbackPage={fallbackPage}
                  layout={layout}
                  onClick={() => onOpenPage(pageNumber)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* A stepper, not a native <select>: this control sits at the window's
          bottom edge, where WebKitGTK's upward-opening dropdown loses its grab
          and dismisses instantly. A stepper has no popup, so it can't. */}
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 bg-[#18191C]/92 px-3 py-2 text-sm text-[#C4C5CA] md:px-4 md:py-3">
        <span>Pages per row</span>
        <div className="flex items-center gap-1">
          <button
            aria-label="Fewer pages per row"
            className="grid h-8 w-8 place-items-center rounded-md bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-40"
            disabled={pagesPerRow <= MIN_PAGES_PER_ROW}
            onClick={() => setPagesPerRow((value) => Math.max(MIN_PAGES_PER_ROW, value - 1))}
            type="button"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[2ch] text-center text-sm font-semibold text-white tabular-nums">{pagesPerRow}</span>
          <button
            aria-label="More pages per row"
            className="grid h-8 w-8 place-items-center rounded-md bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-40"
            disabled={pagesPerRow >= MAX_PAGES_PER_ROW}
            onClick={() => setPagesPerRow((value) => Math.min(MAX_PAGES_PER_ROW, value + 1))}
            type="button"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
