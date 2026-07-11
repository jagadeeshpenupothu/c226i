import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FileText } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PrintLayout } from "@/features/layout/types";
import { computeSheetLayout } from "@/services/layout/layoutEngine";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";

interface PdfOverviewThumbnailProps {
  documentIdentity: string;
  document: PDFDocumentProxy;
  pageNumber: number;
  isVisible: boolean;
  isSelected: boolean;
  printPaper: PrintPaperPreview | null;
  fallbackPage: { widthPt: number; heightPt: number };
  layout: PrintLayout;
  onClick: (event: React.MouseEvent) => void;
}

interface ThumbnailCacheEntry {
  dataUrl: string;
  widthPt: number;
  heightPt: number;
}

const thumbnailCache = new Map<string, ThumbnailCacheEntry>();

export function PdfOverviewThumbnail({
  documentIdentity,
  document,
  pageNumber,
  isVisible,
  isSelected,
  printPaper,
  fallbackPage,
  layout,
  onClick
}: PdfOverviewThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [pageSize, setPageSize] = useState<{ widthPt: number; heightPt: number } | null>(null);
  const [isRendered, setIsRendered] = useState(false);
  const cacheKey = `${documentIdentity}-${document.fingerprints?.[0] || "pdf"}-grid-${pageNumber}`;

  // Same engine as the full preview — the grid tile is just a miniature sheet.
  const sheetLayout = useMemo(
    () => computeSheetLayout(pageSize || fallbackPage, printPaper, layout),
    [fallbackPage, layout, pageSize, printPaper]
  );
  const sheet = sheetLayout.sheet;
  const contentStyle = {
    left: `${(sheetLayout.content.xPt / sheet.widthPt) * 100}%`,
    top: `${(sheetLayout.content.yPt / sheet.heightPt) * 100}%`,
    width: `${(sheetLayout.content.widthPt / sheet.widthPt) * 100}%`,
    height: `${(sheetLayout.content.heightPt / sheet.heightPt) * 100}%`
  } as CSSProperties;
  const marginStyle = sheetLayout.simulated
    ? ({
        left: `${(sheetLayout.margins.left / sheet.widthPt) * 100}%`,
        top: `${(sheetLayout.margins.top / sheet.heightPt) * 100}%`,
        right: `${(sheetLayout.margins.right / sheet.widthPt) * 100}%`,
        bottom: `${(sheetLayout.margins.bottom / sheet.heightPt) * 100}%`
      } as CSSProperties)
    : undefined;

  useEffect(() => {
    setPageSize(null);
    setIsRendered(false);
    renderTaskRef.current?.cancel();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, [documentIdentity, pageNumber]);

  useEffect(() => {
    let cancelled = false;

    async function renderThumbnail() {
      if (!isVisible || !canvasRef.current || isRendered) return;

      const cached = thumbnailCache.get(cacheKey);
      if (cached) {
        const image = new Image();
        image.onload = () => {
          if (cancelled || !canvasRef.current) return;
          canvasRef.current.width = image.width;
          canvasRef.current.height = image.height;
          canvasRef.current.getContext("2d")?.drawImage(image, 0, 0);
          setPageSize({ widthPt: cached.widthPt, heightPt: cached.heightPt });
          setIsRendered(true);
        };
        image.src = cached.dataUrl;
        return;
      }

      try {
        const page = await document.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        setPageSize({ widthPt: baseViewport.width, heightPt: baseViewport.height });
        const targetWidth = 360;
        const targetHeight = 480;
        const scale = Math.min(targetWidth / baseViewport.width, targetHeight / baseViewport.height);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const renderTransform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) return;

        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({ canvasContext: context, viewport, transform: renderTransform });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (!cancelled) {
          setIsRendered(true);
          thumbnailCache.set(cacheKey, {
            dataUrl: canvas.toDataURL("image/jpeg", 0.82),
            widthPt: baseViewport.width,
            heightPt: baseViewport.height
          });
        }
      } catch {
        if (!cancelled) setIsRendered(true);
      }
    }

    renderThumbnail();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [cacheKey, document, isRendered, isVisible, pageNumber]);

  return (
    <button
      className="group grid w-full gap-2 rounded-md p-1 text-left transition hover:bg-white/5"
      onClick={onClick}
      type="button"
    >
      <div
        className={`mx-auto flex w-full items-center justify-center rounded-md border p-1.5 transition ${
          isSelected ? "border-primary bg-primary/10 shadow-[inset_0_0_0_1px_rgba(10,132,255,0.65)]" : "border-white/10 bg-black/10"
        }`}
      >
        <div
          className="relative w-full overflow-hidden rounded-[4px] border border-[#D8D8DE] bg-white shadow-[0_16px_34px_rgba(0,0,0,0.44)] ring-1 ring-black/20 transition-[aspect-ratio] duration-200"
          style={{ aspectRatio: sheet.widthPt / sheet.heightPt }}
        >
          {marginStyle && <div className="pointer-events-none absolute border border-dashed border-sky-500/45" style={marginStyle} />}
          <div className="absolute overflow-hidden bg-white" style={contentStyle}>
            <canvas ref={canvasRef} className="block h-full w-full bg-white" />
          </div>
          {sheetLayout.clipped && <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-rose-500/60" />}
          {!isRendered && (
            <div className="absolute inset-0 flex items-center justify-center bg-white text-[#6b7280]">
              <FileText className="h-6 w-6" />
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-1 text-center">
        <p className={`mx-auto min-w-6 rounded-md px-1.5 py-0.5 text-xs font-medium ${isSelected ? "bg-primary text-white" : "text-white"}`}>
          {pageNumber}
        </p>
      </div>
    </button>
  );
}
