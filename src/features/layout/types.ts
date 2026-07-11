// Print layout is a preview-first concept: it describes how the document is
// placed on the physical sheet, independent of the printer driver. Every field
// here feeds the shared layout engine (src/services/layout/layoutEngine.ts) so
// the WYSIWYG preview and the future print pipeline read from one model.

export type OrientationMode = "auto" | "portrait" | "landscape";
export type ScaleMode = "fit" | "actual" | "custom";
export type MarginMode = "default" | "none" | "custom";
export type AlignMode =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

// --- Roadmap only ---
// These describe layouts that reuse the same rendering pipeline but are not
// wired up tonight. They exist so the engine, settings model, and persisted
// state already carry them — tomorrow's work fills in the plan, not the schema.
export type PageLayoutMode = "single" | "n-up" | "booklet" | "presentation-booklet" | "poster" | "book-fold";
export type PageSetMode = "all" | "odd" | "even";

export interface PrintLayout {
  orientation: OrientationMode;
  scaleMode: ScaleMode;
  /** Percentage 10–400, used when scaleMode === "custom". */
  customScalePercent: number;
  marginMode: MarginMode;
  /** Millimetres per side, used when marginMode === "custom". */
  customMarginMm: number;
  customMarginsMm?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  align: AlignMode;

  // --- Roadmap (architecture placeholders; only the defaults are honoured) ---
  pageLayout: PageLayoutMode;
  pageSet: PageSetMode;
  reverseOrder: boolean;
  mirror: boolean;
  /** Free text like "1-3,5"; empty means every page. */
  pageRange: string;
  /** Manual center-fold pin guides rendered into Presentation Booklet output. */
  pinGuideCount: 0 | 1 | 2 | 3 | 4;
}

export const defaultPrintLayout: PrintLayout = {
  orientation: "auto",
  scaleMode: "fit",
  customScalePercent: 100,
  marginMode: "default",
  customMarginMm: 10,
  customMarginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
  align: "center",
  pageLayout: "single",
  pageSet: "all",
  reverseOrder: false,
  mirror: false,
  pageRange: "",
  pinGuideCount: 0
};

// Merges a persisted (possibly partial or legacy) value onto the defaults so a
// stored layout from an older build never leaves a field undefined.
export function normalizePrintLayout(value: unknown): PrintLayout {
  if (!value || typeof value !== "object") return { ...defaultPrintLayout };
  const partial = value as Partial<PrintLayout>;
  return {
    ...defaultPrintLayout,
    ...partial,
    customScalePercent: clampNumber(partial.customScalePercent, 10, 400, defaultPrintLayout.customScalePercent),
    customMarginMm: clampNumber(partial.customMarginMm, 0, 50, defaultPrintLayout.customMarginMm),
    customMarginsMm: normalizeMargins(partial.customMarginsMm, partial.customMarginMm),
    pinGuideCount: normalizePinGuideCount(partial.pinGuideCount)
  };
}

function normalizePinGuideCount(value: unknown): 0 | 1 | 2 | 3 | 4 {
  const count = Number(value);
  return count === 1 || count === 2 || count === 3 || count === 4 ? count : 0;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeMargins(value: unknown, fallback: unknown) {
  const single = clampNumber(fallback, 0, 50, defaultPrintLayout.customMarginMm);
  if (!value || typeof value !== "object") {
    return { top: single, right: single, bottom: single, left: single };
  }
  const margins = value as Partial<Record<"top" | "right" | "bottom" | "left", unknown>>;
  return {
    top: clampNumber(margins.top, 0, 50, single),
    right: clampNumber(margins.right, 0, 50, single),
    bottom: clampNumber(margins.bottom, 0, 50, single),
    left: clampNumber(margins.left, 0, 50, single)
  };
}

// A compact, human-readable summary of the active layout, shared by every
// preview surface so they describe the layout identically.
export function describePrintLayout(layout: PrintLayout): string {
  const orientation = layout.orientation === "auto" ? "Auto" : capitalize(layout.orientation);
  const scale =
    layout.scaleMode === "fit" ? "Fit to page" : layout.scaleMode === "actual" ? "Actual size" : `${layout.customScalePercent}%`;
  const margins =
    layout.marginMode === "none"
      ? "No margins"
      : layout.marginMode === "custom"
        ? `${layout.customMarginsMm?.top ?? layout.customMarginMm}/${layout.customMarginsMm?.right ?? layout.customMarginMm}/${layout.customMarginsMm?.bottom ?? layout.customMarginMm}/${layout.customMarginsMm?.left ?? layout.customMarginMm} mm margins`
        : "Default margins";
  const align = layout.align === "center" ? "Centered" : layout.align.split("-").map(capitalize).join(" ");
  return [orientation, scale, margins, align].join(" · ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
