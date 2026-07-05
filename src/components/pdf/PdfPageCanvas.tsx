import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

interface PdfOverlaySettings {
  showBleed: boolean;
  showTrim: boolean;
  showSafeArea: boolean;
}

interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PixelInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface PdfPageCanvasProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  /** pdf.js render scale in CSS px per point (already folds in viewer zoom). */
  renderScale: number;
  rotation: number;
  isActive: boolean;
  /** Sheet (paper) size in CSS px. */
  sheetWidth: number;
  sheetHeight: number;
  /** Document placement on the sheet in CSS px, from the layout engine. */
  content: PixelBox;
  /** Printable-area insets in CSS px. */
  margins: PixelInsets;
  clipped: boolean;
  simulated: boolean;
  paperLabel: string | null;
  overlays: PdfOverlaySettings;
}

export function PdfPageCanvas({
  document,
  pageNumber,
  renderScale,
  rotation,
  isActive,
  sheetWidth,
  sheetHeight,
  content,
  margins,
  clipped,
  simulated,
  paperLabel,
  overlays
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderIdRef = useRef(0);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        const viewport = page.getViewport({ scale: renderScale, rotation: (page.rotate + rotation) % 360 });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const renderTransform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
        const renderContext = targetCanvas.getContext("2d", { alpha: false });

        if (!renderContext) {
          setError("Unable to prepare the page canvas.");
          return;
        }

        targetCanvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        targetCanvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
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
  }, [document, isActive, pageNumber, rotation, renderScale]);

  return (
    <div
      className={`relative mx-auto overflow-hidden rounded-sm bg-white shadow-[0_18px_44px_rgba(0,0,0,0.42)] transition-[width,height] duration-200 ease-out ${
        simulated ? "border border-white ring-1 ring-black/25" : "border border-white/40"
      }`}
      style={{ width: sheetWidth, height: sheetHeight }}
    >
      <div
        className="absolute overflow-hidden bg-white"
        style={{ left: content.left, top: content.top, width: content.width, height: content.height }}
      >
        <canvas ref={canvasRef} className="block h-full w-full bg-white" />
      </div>

      {simulated && (
        <>
          <div
            className="pointer-events-none absolute border border-dashed border-sky-500/70"
            style={{ left: margins.left, top: margins.top, right: margins.right, bottom: margins.bottom }}
          />
          {paperLabel && (
            <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
              {paperLabel}
            </div>
          )}
        </>
      )}

      {clipped && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-inset ring-rose-500/70" />
          <div className="pointer-events-none absolute right-2 top-2 rounded bg-rose-600/85 px-2 py-1 text-[10px] font-semibold text-white">
            Content extends beyond the page
          </div>
        </>
      )}

      {overlays.showBleed && <Guide inset={Math.max(2, 3 * renderScale)} color="border-rose-500/80" />}
      {overlays.showTrim && <Guide inset={Math.max(4, 8 * renderScale)} color="border-amber-400/80" />}
      {overlays.showSafeArea && <Guide inset={Math.max(8, 18 * renderScale)} color="border-emerald-400/80" />}

      {isRendering && !error && !clipped && (
        <div className="absolute right-2 top-2 rounded bg-black/55 px-2 py-1 text-[10px] text-white">Rendering…</div>
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
