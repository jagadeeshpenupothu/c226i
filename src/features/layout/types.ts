// Print layout is a preview-first concept: it describes how the document is
// placed on the physical sheet, independent of the printer driver. Every field
// here feeds the shared layout engine (src/services/layout/layoutEngine.ts) so
// the WYSIWYG preview and the future print pipeline read from one model.

export type OrientationMode = "auto" | "portrait" | "landscape";
export type ScaleMode = "fit" | "actual" | "custom";
export type MarginMode = "default" | "none" | "custom";
export type AlignMode = "center" | "top-left";

// --- Roadmap only ---
// These describe layouts that reuse the same rendering pipeline but are not
// wired up tonight. They exist so the engine, settings model, and persisted
// state already carry them — tomorrow's work fills in the plan, not the schema.
export type PageLayoutMode = "single" | "n-up" | "booklet" | "poster" | "book-fold";
export type PageSetMode = "all" | "odd" | "even";

export interface PrintLayout {
  orientation: OrientationMode;
  scaleMode: ScaleMode;
  /** Percentage 10–400, used when scaleMode === "custom". */
  customScalePercent: number;
  marginMode: MarginMode;
  /** Millimetres per side, used when marginMode === "custom". */
  customMarginMm: number;
  align: AlignMode;

  // --- Roadmap (architecture placeholders; only the defaults are honoured) ---
  pageLayout: PageLayoutMode;
  pageSet: PageSetMode;
  reverseOrder: boolean;
  mirror: boolean;
  /** Free text like "1-3,5"; empty means every page. */
  pageRange: string;
}

export const defaultPrintLayout: PrintLayout = {
  orientation: "auto",
  scaleMode: "fit",
  customScalePercent: 100,
  marginMode: "default",
  customMarginMm: 10,
  align: "center",
  pageLayout: "single",
  pageSet: "all",
  reverseOrder: false,
  mirror: false,
  pageRange: ""
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
    customMarginMm: clampNumber(partial.customMarginMm, 0, 50, defaultPrintLayout.customMarginMm)
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
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
        ? `${layout.customMarginMm} mm margins`
        : "Default margins";
  const align = layout.align === "center" ? "Centered" : "Top-left";
  return [orientation, scale, margins, align].join(" · ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
