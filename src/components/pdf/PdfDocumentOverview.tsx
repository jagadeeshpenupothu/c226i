import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfFile } from "@/features/pdf/types";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";
import { formatFileSize } from "@/services/pdf/pdfMetadata";
import type { PdfPageSize } from "@/types/pdf";
import { useElementSize } from "@/hooks/useElementSize";
import { PdfOverviewThumbnail } from "./PdfOverviewThumbnail";

interface PdfDocumentOverviewProps {
  file: PdfFile;
  document: PDFDocumentProxy;
  pageCount: number;
  firstPage: PdfPageSize;
  fileSizeBytes: number | null;
  printPaper: PrintPaperPreview | null;
  printerName?: string;
}

const PAGES_PER_ROW_OPTIONS = [2, 3, 4, 5, 6, 8, 10];
export type PreviewMode = "fit-to-paper" | "fill-paper" | "stretch" | "actual-size" | "center" | "fit-width" | "fit-height";

const PREVIEW_MODES: { value: PreviewMode; label: string }[] = [
  { value: "fit-to-paper", label: "Fit to Paper" },
  { value: "fill-paper", label: "Fill Paper" },
  { value: "stretch", label: "Stretch" },
  { value: "actual-size", label: "Actual Size (100%)" },
  { value: "center", label: "Center" },
  { value: "fit-width", label: "Fit Width" },
  { value: "fit-height", label: "Fit Height" }
];

export function PdfDocumentOverview({
  file,
  document,
  pageCount,
  firstPage,
  fileSizeBytes,
  printPaper,
  printerName
}: PdfDocumentOverviewProps) {
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const gridSize = useElementSize(gridElement);
  const [selectedPage, setSelectedPage] = useState(1);
  const [search, setSearch] = useState("1");
  const [pagesPerRow, setPagesPerRow] = useState(5);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("fit-to-paper");
  const paperSize = useMemo(
    () => ({
      label: printPaper?.label || firstPage.paperSize,
      widthPt: printPaper?.widthPt || firstPage.widthPt,
      heightPt: printPaper?.heightPt || firstPage.heightPt,
      marginPt: printPaper?.marginPt || (3 * 72) / 25.4
    }),
    [firstPage.heightPt, firstPage.paperSize, firstPage.widthPt, printPaper]
  );
  const paperAspectRatio = useMemo(() => paperSize.widthPt / paperSize.heightPt, [paperSize.heightPt, paperSize.widthPt]);
  const documentDetails = [
    `${pageCount} ${pageCount === 1 ? "Page" : "Pages"}`,
    `${firstPage.paperSize} ${firstPage.orientation}`,
    formatFileSize(fileSizeBytes),
    `Printer: ${printerName || "Not selected"}`,
    `Paper: ${paperSize.label}`
  ];
  const gridStyle = {
    "--pages-per-row": effectivePagesPerRow(gridSize.width, pagesPerRow),
    "--paper-ratio": paperAspectRatio
  } as CSSProperties;

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

      <div className="flex shrink-0 items-center justify-end border-b border-white/10 bg-black/10 px-3 py-2 md:px-4 md:py-3">
        <label className="flex min-w-0 items-center gap-2 text-sm text-[#C4C5CA]">
          <span className="shrink-0">Preview Mode</span>
          <select
            aria-label="Preview mode"
            className="h-8 max-w-[180px] rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white outline-none focus:ring-2 focus:ring-primary md:max-w-none"
            value={previewMode}
            onChange={(event) => setPreviewMode(event.target.value as PreviewMode)}
          >
            {PREVIEW_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={setGridElement} className="min-h-0 flex-1 overflow-auto px-3 py-4 md:px-5 md:py-6">
        <div
          className="grid items-start gap-x-3 gap-y-4 transition-[grid-template-columns] duration-200 ease-out md:gap-x-4 md:gap-y-5"
          style={{
            ...gridStyle,
            gridTemplateColumns: "repeat(var(--pages-per-row), minmax(0, 1fr))"
          }}
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
                  document={document}
                  isSelected={selectedPage === pageNumber}
                  isVisible
                  pageNumber={pageNumber}
                  paperSize={paperSize}
                  previewMode={previewMode}
                  onClick={() => goToPage(pageNumber)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-white/10 bg-[#18191C]/92 px-3 py-2 md:px-4 md:py-3">
        <label className="flex items-center gap-2 text-sm text-[#C4C5CA]">
          <span>Pages per row</span>
          <select
            aria-label="Pages per row"
            className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white outline-none focus:ring-2 focus:ring-primary"
            value={pagesPerRow}
            onChange={(event) => setPagesPerRow(Number(event.target.value))}
          >
            {PAGES_PER_ROW_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function effectivePagesPerRow(containerWidth: number, selectedPagesPerRow: number) {
  if (!containerWidth) return selectedPagesPerRow;

  const minimumThumbnailWidth = containerWidth >= 1100 ? 150 : containerWidth >= 760 ? 135 : 118;
  const gap = containerWidth >= 760 ? 16 : 12;
  const comfortableColumns = Math.max(2, Math.floor((containerWidth + gap) / (minimumThumbnailWidth + gap)));

  return Math.max(2, Math.min(selectedPagesPerRow, comfortableColumns));
}
