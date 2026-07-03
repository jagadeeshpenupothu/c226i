import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FileText } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PreviewMode } from "./PdfDocumentOverview";

interface PreviewPaperSize {
  label: string;
  widthPt: number;
  heightPt: number;
  marginPt: number;
}

interface PdfOverviewThumbnailProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  isVisible: boolean;
  isSelected: boolean;
  paperSize: PreviewPaperSize;
  previewMode: PreviewMode;
  onClick: (event: React.MouseEvent) => void;
}

interface ThumbnailCacheEntry {
  dataUrl: string;
  widthPt: number;
  heightPt: number;
}

const thumbnailCache = new Map<string, ThumbnailCacheEntry>();

export function PdfOverviewThumbnail({
  document,
  pageNumber,
  isVisible,
  isSelected,
  paperSize,
  previewMode,
  onClick
}: PdfOverviewThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [pageSize, setPageSize] = useState({ widthPt: paperSize.widthPt, heightPt: paperSize.heightPt });
  const [isRendered, setIsRendered] = useState(false);
  const cacheKey = `${document.fingerprints?.[0] || "pdf"}-grid-${pageNumber}`;
  const layout = getPdfLayout(paperSize, pageSize, previewMode);
  const marginPercent = Math.max(0, Math.min(18, (paperSize.marginPt / Math.min(paperSize.widthPt, paperSize.heightPt)) * 100));
  const pdfStyle = {
    left: `${layout.leftPercent}%`,
    top: `${layout.topPercent}%`,
    width: `${layout.widthPercent}%`,
    height: `${layout.heightPercent}%`
  } as CSSProperties;

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
          className="relative w-full overflow-hidden rounded-[4px] border border-[#D8D8DE] bg-white shadow-[0_16px_34px_rgba(0,0,0,0.44)] ring-1 ring-black/20"
          style={{ aspectRatio: paperSize.widthPt / paperSize.heightPt }}
        >
          <div
            className="pointer-events-none absolute border border-dashed border-sky-500/55 bg-white"
            style={{
              inset: `${marginPercent}%`
            }}
          >
            <div className="absolute overflow-hidden" style={pdfStyle}>
              <canvas ref={canvasRef} className="block h-full w-full bg-white" />
            </div>
          </div>
          {!isRendered && (
            <div className="absolute flex items-center justify-center rounded-sm bg-white text-[#6b7280]" style={{ inset: `${marginPercent}%` }}>
              <FileText className="h-6 w-6" />
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-1 text-center">
        <p
          className={`mx-auto min-w-6 rounded-md px-1.5 py-0.5 text-xs font-medium ${isSelected ? "bg-primary text-white" : "text-white"}`}
        >
          {pageNumber}
        </p>
      </div>
    </button>
  );
}

function getPdfLayout(paper: PreviewPaperSize, page: { widthPt: number; heightPt: number }, mode: PreviewMode) {
  const margin = Math.min(paper.marginPt, paper.widthPt / 4, paper.heightPt / 4);
  const printableWidth = Math.max(1, paper.widthPt - margin * 2);
  const printableHeight = Math.max(1, paper.heightPt - margin * 2);
  const pageWidth = Math.max(1, page.widthPt);
  const pageHeight = Math.max(1, page.heightPt);
  const fitScale = Math.min(printableWidth / pageWidth, printableHeight / pageHeight);
  const fillScale = Math.max(printableWidth / pageWidth, printableHeight / pageHeight);

  let contentWidth = pageWidth;
  let contentHeight = pageHeight;

  switch (mode) {
    case "fill-paper":
      contentWidth = pageWidth * fillScale;
      contentHeight = pageHeight * fillScale;
      break;
    case "stretch":
      contentWidth = printableWidth;
      contentHeight = printableHeight;
      break;
    case "actual-size":
    case "center":
      contentWidth = pageWidth;
      contentHeight = pageHeight;
      break;
    case "fit-width":
      contentWidth = printableWidth;
      contentHeight = pageHeight * (printableWidth / pageWidth);
      break;
    case "fit-height":
      contentWidth = pageWidth * (printableHeight / pageHeight);
      contentHeight = printableHeight;
      break;
    case "fit-to-paper":
    default:
      contentWidth = pageWidth * fitScale;
      contentHeight = pageHeight * fitScale;
      break;
  }

  return {
    leftPercent: ((printableWidth - contentWidth) / 2 / printableWidth) * 100,
    topPercent: ((printableHeight - contentHeight) / 2 / printableHeight) * 100,
    widthPercent: (contentWidth / printableWidth) * 100,
    heightPercent: (contentHeight / printableHeight) * 100
  };
}
