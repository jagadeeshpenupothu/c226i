import {
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Maximize,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ZoomMode } from "@/types/pdf";

interface PdfOverlaySettings {
  showBleed: boolean;
  showTrim: boolean;
  showSafeArea: boolean;
}

interface PdfToolbarProps {
  currentPage: number;
  pageCount: number;
  zoomPercent: number;
  zoomMode: ZoomMode;
  disabled: boolean;
  onFirstPage: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onLastPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onActualSize: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onPresetZoom: (scale: number) => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  overlays: PdfOverlaySettings;
  onToggleOverlay: (overlay: keyof PdfOverlaySettings) => void;
}

export function PdfToolbar({
  currentPage,
  pageCount,
  zoomPercent,
  zoomMode,
  disabled,
  onFirstPage,
  onPreviousPage,
  onNextPage,
  onLastPage,
  onZoomIn,
  onZoomOut,
  onActualSize,
  onFitWidth,
  onFitPage,
  onPresetZoom,
  onRotateLeft,
  onRotateRight,
  overlays,
  onToggleOverlay
}: PdfToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-[#3A3A3C]/95 px-3 py-2 text-white backdrop-blur">
      <div className="flex items-center gap-1">
        <Button aria-label="First page" title="First Page" variant="ghost" size="icon" disabled={disabled || currentPage <= 1} onClick={onFirstPage}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button aria-label="Previous page" title="Previous" variant="ghost" size="icon" disabled={disabled || currentPage <= 1} onClick={onPreviousPage}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="mx-2 min-w-[104px] text-center text-sm font-medium">
          Page {pageCount ? currentPage : 0} of {pageCount}
        </span>
        <Button aria-label="Next page" title="Next" variant="ghost" size="icon" disabled={disabled || currentPage >= pageCount} onClick={onNextPage}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button aria-label="Last page" title="Last Page" variant="ghost" size="icon" disabled={disabled || currentPage >= pageCount} onClick={onLastPage}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button aria-label="Zoom out" title="Zoom Out" variant="ghost" size="icon" disabled={disabled} onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          className="h-9 min-w-[72px] rounded-md px-2 text-sm font-medium transition hover:bg-white/10 disabled:opacity-50"
          disabled={disabled}
          onClick={onActualSize}
          title="Actual Size"
        >
          {zoomPercent}%
        </button>
        <Button aria-label="Zoom in" title="Zoom In" variant="ghost" size="icon" disabled={disabled} onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <select
          aria-label="Zoom preset"
          className="h-9 rounded-md border border-white/10 bg-[#2C2C2E] px-2 text-sm text-white outline-none transition focus:ring-2 focus:ring-primary disabled:opacity-50"
          disabled={disabled}
          value={nearestPreset(zoomPercent)}
          onChange={(event) => onPresetZoom(Number(event.target.value) / 100)}
        >
          {[25, 50, 75, 100, 125, 150, 200, 300, 400].map((value) => (
            <option key={value} value={value}>
              {value}%
            </option>
          ))}
        </select>
        <button
          className={`h-9 rounded-md px-3 text-sm font-medium transition hover:bg-white/10 disabled:opacity-50 ${zoomMode === "fit-width" ? "bg-white/15" : ""}`}
          disabled={disabled}
          onClick={onFitWidth}
        >
          Fit Width
        </button>
        <Button aria-label="Fit page" title="Fit Page" variant={zoomMode === "fit-page" ? "secondary" : "ghost"} size="icon" disabled={disabled} onClick={onFitPage}>
          <Maximize className="h-4 w-4" />
        </Button>
        <Button aria-label="Rotate left" title="Rotate Left" variant="ghost" size="icon" disabled={disabled} onClick={onRotateLeft}>
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button aria-label="Rotate right" title="Rotate Right" variant="ghost" size="icon" disabled={disabled} onClick={onRotateRight}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-[#AEAEB2]">
        <OverlayToggle label="Show Bleed" active={overlays.showBleed} disabled={disabled} onClick={() => onToggleOverlay("showBleed")} />
        <OverlayToggle label="Show Trim Line" active={overlays.showTrim} disabled={disabled} onClick={() => onToggleOverlay("showTrim")} />
        <OverlayToggle label="Show Safe Area" active={overlays.showSafeArea} disabled={disabled} onClick={() => onToggleOverlay("showSafeArea")} />
      </div>
    </div>
  );
}

function OverlayToggle({
  label,
  active,
  disabled,
  onClick
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 transition hover:bg-white/10 disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="inline-flex h-3 w-3 items-center justify-center rounded-[3px] border border-[#AEAEB2] text-[9px] text-primary">
        {active ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

function nearestPreset(zoomPercent: number) {
  const presets = [25, 50, 75, 100, 125, 150, 200, 300, 400];
  return presets.reduce((nearest, value) =>
    Math.abs(value - zoomPercent) < Math.abs(nearest - zoomPercent) ? value : nearest
  );
}
