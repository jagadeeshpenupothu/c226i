import { useEffect } from "react";

interface PdfKeyboardHandlers {
  enabled: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onActualSize: () => void;
  onFitWidth: () => void;
}

export function usePdfKeyboardShortcuts({
  enabled,
  onPreviousPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onActualSize,
  onFitWidth
}: PdfKeyboardHandlers) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button")) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPreviousPage();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNextPage();
        return;
      }

      if (!event.metaKey) return;

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        onZoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        onZoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        onActualSize();
      } else if (event.key === "9") {
        event.preventDefault();
        onFitWidth();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onActualSize, onFitWidth, onNextPage, onPreviousPage, onZoomIn, onZoomOut]);
}
