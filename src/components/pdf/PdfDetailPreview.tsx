import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { describePrintLayout, type PrintLayout } from "@/features/layout/types";
import type { PdfFile } from "@/features/pdf/types";
import { useElementSize } from "@/hooks/useElementSize";
import { usePdfKeyboardShortcuts } from "@/hooks/usePdfKeyboardShortcuts";
import { computeSheetLayout } from "@/services/layout/layoutEngine";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";
import type { PdfPageSize, ZoomMode } from "@/types/pdf";
import { PdfInfoBar } from "./PdfInfoBar";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { PdfToolbar } from "./PdfToolbar";

const PAGE_GAP = 24;
const VIEWER_PADDING = 24;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const RENDER_OVERSCAN = 2;
const ZOOM_STORAGE_KEY = "printpilot.zoom";

// Restores the zoom mode/scale from the previous session so reopening a document
// feels continuous.
function readStoredZoom(): { mode: ZoomMode; scale: number } {
  try {
    const parsed = JSON.parse(localStorage.getItem(ZOOM_STORAGE_KEY) || "");
    const mode: ZoomMode = ["fit-width", "fit-page", "actual", "custom"].includes(parsed?.mode) ? parsed.mode : "fit-width";
    const scale = typeof parsed?.scale === "number" && parsed.scale > 0 ? parsed.scale : 1;
    return { mode, scale };
  } catch {
    return { mode: "fit-width", scale: 1 };
  }
}

interface PdfDetailPreviewProps {
  file: PdfFile;
  document: PDFDocumentProxy;
  pageCount: number;
  firstPage: PdfPageSize;
  fileSizeBytes: number | null;
  printPaper: PrintPaperPreview | null;
  layout: PrintLayout;
  initialPage: number;
  onBack: () => void;
}

export function PdfDetailPreview({
  file,
  document,
  pageCount,
  firstPage,
  fileSizeBytes,
  printPaper,
  layout,
  initialPage,
  onBack
}: PdfDetailPreviewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const viewportSize = useElementSize(scrollElement);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [zoomMode, setZoomMode] = useState<ZoomMode>(() => readStoredZoom().mode);
  const [customScale, setCustomScale] = useState(() => readStoredZoom().scale);
  const [rotation, setRotation] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 1 });
  const [overlays, setOverlays] = useState({
    showBleed: false,
    showTrim: false,
    showSafeArea: false
  });
  const setViewerRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollElement(node);
  }, []);

  // The layout engine turns (rotated page, paper, print layout) into a fully
  // positioned sheet in points. Viewer zoom then converts points → CSS pixels.
  const rotatedSize = useMemo(() => getRotatedPageSize(firstPage, rotation), [firstPage, rotation]);
  const sheetLayout = useMemo(
    () => computeSheetLayout(rotatedSize, printPaper, layout),
    [layout, printPaper, rotatedSize]
  );
  const sheet = sheetLayout.sheet;

  const zoom = useMemo(() => {
    if (zoomMode === "actual" || zoomMode === "custom") return customScale;

    const availableWidth = Math.max(1, viewportSize.width - VIEWER_PADDING * 2);
    const availableHeight = Math.max(1, viewportSize.height - VIEWER_PADDING * 2);
    const fitWidth = availableWidth / sheet.widthPt;

    if (zoomMode === "fit-page") {
      return clamp(Math.min(fitWidth, availableHeight / sheet.heightPt), MIN_SCALE, MAX_SCALE);
    }

    return clamp(fitWidth, MIN_SCALE, MAX_SCALE);
  }, [customScale, sheet.heightPt, sheet.widthPt, viewportSize.height, viewportSize.width, zoomMode]);

  const sheetWidth = Math.round(sheet.widthPt * zoom);
  const sheetHeight = Math.round(sheet.heightPt * zoom);
  const contentBox = {
    left: Math.round(sheetLayout.content.xPt * zoom),
    top: Math.round(sheetLayout.content.yPt * zoom),
    width: Math.round(sheetLayout.content.widthPt * zoom),
    height: Math.round(sheetLayout.content.heightPt * zoom)
  };
  const marginBox = {
    top: Math.round(sheetLayout.margins.top * zoom),
    right: Math.round(sheetLayout.margins.right * zoom),
    bottom: Math.round(sheetLayout.margins.bottom * zoom),
    left: Math.round(sheetLayout.margins.left * zoom)
  };
  const renderScale = sheetLayout.contentScale * zoom;
  const pageStride = sheetHeight + PAGE_GAP;
  const zoomPercent = Math.round(zoom * 100);

  const scrollToPage = useCallback(
    (page: number) => {
      const nextPage = clampPage(page, pageCount);
      setCurrentPage(nextPage);
      scrollRef.current?.scrollTo({
        top: VIEWER_PADDING + (nextPage - 1) * pageStride,
        behavior: "smooth"
      });
    },
    [pageCount, pageStride]
  );

  const setPresetZoom = useCallback((nextScale: number) => {
    setZoomMode("custom");
    setCustomScale(clamp(nextScale, MIN_SCALE, MAX_SCALE));
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setZoomMode("custom");
    setCustomScale(clamp(zoom + delta, MIN_SCALE, MAX_SCALE));
  }, [zoom]);

  const setActualSize = useCallback(() => {
    setCustomScale(1);
    setZoomMode("actual");
  }, []);

  const setFitWidth = useCallback(() => setZoomMode("fit-width"), []);
  const setFitPage = useCallback(() => setZoomMode("fit-page"), []);

  const updateVisiblePages = useCallback(() => {
    const element = scrollRef.current;
    if (!element || !pageCount || !pageStride) return;

    const firstVisible = clampPage(Math.floor(Math.max(0, element.scrollTop - VIEWER_PADDING) / pageStride) + 1, pageCount);
    const lastVisible = clampPage(Math.ceil((element.scrollTop + element.clientHeight) / pageStride), pageCount);
    setCurrentPage(firstVisible);
    setVisibleRange({
      start: Math.max(1, firstVisible - RENDER_OVERSCAN),
      end: Math.min(pageCount, lastVisible + RENDER_OVERSCAN)
    });
  }, [pageCount, pageStride]);

  useEffect(() => {
    setCurrentPage(initialPage);
    setVisibleRange({
      start: Math.max(1, initialPage - RENDER_OVERSCAN),
      end: Math.min(pageCount, initialPage + RENDER_OVERSCAN)
    });
    requestAnimationFrame(() => scrollToPage(initialPage));
  }, [initialPage, pageCount, scrollToPage]);

  useEffect(() => {
    updateVisiblePages();
  }, [updateVisiblePages, zoom, rotation]);

  // Persist the zoom preference for the next session.
  useEffect(() => {
    localStorage.setItem(ZOOM_STORAGE_KEY, JSON.stringify({ mode: zoomMode, scale: customScale }));
  }, [zoomMode, customScale]);

  usePdfKeyboardShortcuts({
    enabled: true,
    onPreviousPage: () => scrollToPage(currentPage - 1),
    onNextPage: () => scrollToPage(currentPage + 1),
    onZoomIn: () => zoomBy(0.1),
    onZoomOut: () => zoomBy(-0.1),
    onActualSize: setActualSize,
    onFitWidth: setFitWidth
  });

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 0.08 : -0.08);
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-[#48484A] bg-[#2C2C2E] px-3 py-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Document Overview
        </Button>
      </div>
      <PdfInfoBar
        file={file}
        pageCount={pageCount}
        firstPage={firstPage}
        fileSizeBytes={fileSizeBytes}
        printPaper={printPaper}
        layoutSummary={describeLayout(layout, sheetLayout.clipped)}
      />
      <PdfToolbar
        currentPage={currentPage}
        pageCount={pageCount}
        zoomPercent={zoomPercent}
        zoomMode={zoomMode}
        disabled={false}
        onFirstPage={() => scrollToPage(1)}
        onPreviousPage={() => scrollToPage(currentPage - 1)}
        onNextPage={() => scrollToPage(currentPage + 1)}
        onLastPage={() => scrollToPage(pageCount)}
        onZoomIn={() => zoomBy(0.1)}
        onZoomOut={() => zoomBy(-0.1)}
        onActualSize={setActualSize}
        onFitWidth={setFitWidth}
        onFitPage={setFitPage}
        onPresetZoom={setPresetZoom}
        onRotateLeft={() => setRotation((value) => (value + 270) % 360)}
        onRotateRight={() => setRotation((value) => (value + 90) % 360)}
        overlays={overlays}
        onToggleOverlay={(overlay) => setOverlays((current) => ({ ...current, [overlay]: !current[overlay] }))}
      />

      <div ref={setViewerRef} className="flex-1 overflow-auto bg-[#1C1C1E]" onScroll={updateVisiblePages} onWheel={onWheel}>
        <div
          className="relative mx-auto"
          style={{
            width: Math.max(sheetWidth + VIEWER_PADDING * 2, viewportSize.width),
            height: VIEWER_PADDING * 2 + pageCount * sheetHeight + Math.max(0, pageCount - 1) * PAGE_GAP
          }}
        >
          {Array.from({ length: pageCount }, (_, index) => {
            const pageNumber = index + 1;
            const isActive = pageNumber >= visibleRange.start && pageNumber <= visibleRange.end;

            return (
              <div
                key={pageNumber}
                className="absolute left-0 right-0"
                style={{ top: VIEWER_PADDING + index * pageStride, height: sheetHeight }}
              >
                <PdfPageCanvas
                  document={document}
                  pageNumber={pageNumber}
                  renderScale={renderScale}
                  rotation={rotation}
                  isActive={isActive}
                  sheetWidth={sheetWidth}
                  sheetHeight={sheetHeight}
                  content={contentBox}
                  margins={marginBox}
                  clipped={sheetLayout.clipped}
                  simulated={sheetLayout.simulated}
                  paperLabel={sheetLayout.paperLabel}
                  overlays={overlays}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function describeLayout(layout: PrintLayout, clipped: boolean): string {
  return [describePrintLayout(layout), clipped ? "⚠ clipped" : null].filter(Boolean).join(" · ");
}

function getRotatedPageSize(firstPage: PdfPageSize, rotation: number) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return { widthPt: firstPage.heightPt, heightPt: firstPage.widthPt };
  }

  return { widthPt: firstPage.widthPt, heightPt: firstPage.heightPt };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampPage(value: number, pageCount: number) {
  if (!pageCount) return 1;
  return Math.min(pageCount, Math.max(1, value));
}
