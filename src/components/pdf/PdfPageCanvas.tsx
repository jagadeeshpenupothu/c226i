import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";

interface PdfOverlaySettings {
  showBleed: boolean;
  showTrim: boolean;
  showSafeArea: boolean;
}

interface PdfPageCanvasProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotation: number;
  isActive: boolean;
  sheetWidth: number;
  sheetHeight: number;
  pdfWidth: number;
  pdfHeight: number;
  printPaper: PrintPaperPreview | null;
  overlays: PdfOverlaySettings;
}

export function PdfPageCanvas({
  document,
  pageNumber,
  scale,
  rotation,
  isActive,
  sheetWidth,
  sheetHeight,
  pdfWidth,
  pdfHeight,
  printPaper,
  overlays
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderIdRef = useRef(0);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pdfLeft = Math.max(0, (sheetWidth - pdfWidth) / 2);
  const pdfTop = Math.max(0, (sheetHeight - pdfHeight) / 2);
  const printableMargin = printPaper ? printPaper.marginPt * scale : 0;

  useEffect(() => {
    if (!isActive) return;

    const renderCanvas = canvasRef.current;
    if (!renderCanvas) return;
    const targetCanvas = renderCanvas;

    let cancelled = false;
    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;

    async function renderPage() {
      try {
        setIsRendering(true);
        setError(null);
        renderTaskRef.current?.cancel();

        const page = await document.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const renderTransform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
        const renderContext = targetCanvas.getContext("2d", { alpha: false });

        if (!renderContext) {
          setError("Unable to prepare the page canvas.");
          return;
        }

        targetCanvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        targetCanvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        targetCanvas.style.width = `${viewport.width}px`;
        targetCanvas.style.height = `${viewport.height}px`;
        renderContext.setTransform(1, 0, 0, 1, 0, 0);
        renderContext.fillStyle = "#ffffff";
        renderContext.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

        const renderTask = page.render({ canvasContext: renderContext, viewport, transform: renderTransform });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (cancelled || renderId !== renderIdRef.current) {
          return;
        }
      } catch (renderError) {
        if (!cancelled && !String(renderError).includes("Rendering cancelled")) {
          setError("Unable to render this page.");
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [document, isActive, pageNumber, rotation, scale]);

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-sm border border-white bg-white shadow-[0_18px_44px_rgba(0,0,0,0.42)] ring-1 ring-black/25"
      style={{ width: sheetWidth, height: sheetHeight }}
    >
      <div
        className="absolute bg-white"
        style={{
          left: pdfLeft,
          top: pdfTop,
          width: pdfWidth,
          height: pdfHeight
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute left-0 top-0 block bg-white"
          style={{
            width: pdfWidth,
            height: pdfHeight,
            zIndex: 1
          }}
        />
      </div>

      {printPaper && (
        <>
          <div
            className="pointer-events-none absolute border border-dashed border-sky-500/70"
            style={{
              left: printableMargin,
              top: printableMargin,
              right: printableMargin,
              bottom: printableMargin
            }}
          />
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
            {printPaper.label}
          </div>
        </>
      )}

      {overlays.showBleed && <Guide inset={Math.max(2, 3 * scale)} color="border-rose-500/80" />}
      {overlays.showTrim && <Guide inset={Math.max(4, 8 * scale)} color="border-amber-400/80" />}
      {overlays.showSafeArea && <Guide inset={Math.max(8, 18 * scale)} color="border-emerald-400/80" />}

      {isRendering && !error && (
        <div className="absolute right-2 top-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white">
          Rendering...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white px-4 text-center text-xs text-muted-foreground">
          {error}
        </div>
      )}
    </div>
  );
}

function Guide({ inset, color }: { inset: number; color: string }) {
  return (
    <div
      className={`pointer-events-none absolute border ${color}`}
      style={{ left: inset, top: inset, right: inset, bottom: inset }}
    />
  );
}
