import type { PrintLayout } from "@/features/layout/types";
import type { PrintPaperPreview } from "@/services/pdf/printPreview";

// The layout engine is a pure, framework-free translation from
//   (document page size, chosen paper, print layout)
// into a fully positioned sheet, expressed in PDF points.
//
// It is deliberately the ONLY place that decides where the document sits on the
// paper. Both the WYSIWYG detail preview and the overview thumbnails call it, so
// every surface agrees. Because it is pure it is trivial to unit test and to
// reuse for future layouts (N-Up, Booklet, Poster) that only need to remap which
// source pages land on each sheet — the placement math stays here.

const MM_TO_PT = 72 / 25.4;

export interface Size {
  widthPt: number;
  heightPt: number;
}

export interface Box {
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SheetLayout {
  /** The physical sheet after orientation, in points. */
  sheet: Size;
  margins: Margins;
  /** Printable area = sheet minus margins. */
  printable: Box;
  /** Where the document is drawn on the sheet. */
  content: Box;
  /** Magnification applied to the source page (page-pt → sheet-pt). */
  contentScale: number;
  /** True when the document spills outside the printable area / sheet. */
  clipped: boolean;
  paperLabel: string | null;
  /** False when there is no paper to simulate (sheet === page). */
  simulated: boolean;
}

// Computes the placement of one document page on one sheet.
export function computeSheetLayout(page: Size, printPaper: PrintPaperPreview | null, layout: PrintLayout): SheetLayout {
  const safePage: Size = {
    widthPt: Math.max(1, page.widthPt),
    heightPt: Math.max(1, page.heightPt)
  };

  // No paper chosen (e.g. before a printer is connected and no fallback resolved):
  // treat the document as its own sheet so the preview still renders honestly.
  if (!printPaper) {
    return {
      sheet: safePage,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      printable: { xPt: 0, yPt: 0, widthPt: safePage.widthPt, heightPt: safePage.heightPt },
      content: { xPt: 0, yPt: 0, widthPt: safePage.widthPt, heightPt: safePage.heightPt },
      contentScale: 1,
      clipped: false,
      paperLabel: null,
      simulated: false
    };
  }

  const pageLandscape = safePage.widthPt >= safePage.heightPt;
  const sheet = orientPaper(printPaper, layout.orientation, pageLandscape);
  const margins = resolveMargins(printPaper, layout, sheet);
  const printable: Box = {
    xPt: margins.left,
    yPt: margins.top,
    widthPt: Math.max(1, sheet.widthPt - margins.left - margins.right),
    heightPt: Math.max(1, sheet.heightPt - margins.top - margins.bottom)
  };

  const contentScale = resolveScale(safePage, printable, layout);
  const contentWidth = safePage.widthPt * contentScale;
  const contentHeight = safePage.heightPt * contentScale;
  const position = alignContent(printable, contentWidth, contentHeight, layout.align);

  const tolerance = 0.5;
  const clipped =
    contentWidth > printable.widthPt + tolerance ||
    contentHeight > printable.heightPt + tolerance ||
    position.xPt < -tolerance ||
    position.yPt < -tolerance ||
    position.xPt + contentWidth > sheet.widthPt + tolerance ||
    position.yPt + contentHeight > sheet.heightPt + tolerance;

  return {
    sheet,
    margins,
    printable,
    content: { xPt: position.xPt, yPt: position.yPt, widthPt: contentWidth, heightPt: contentHeight },
    contentScale,
    clipped,
    paperLabel: printPaper.label,
    simulated: true
  };
}

function orientPaper(paper: PrintPaperPreview, mode: PrintLayout["orientation"], pageLandscape: boolean): Size {
  const shortSide = Math.min(paper.widthPt, paper.heightPt);
  const longSide = Math.max(paper.widthPt, paper.heightPt);
  const portrait: Size = { widthPt: shortSide, heightPt: longSide };
  const landscape: Size = { widthPt: longSide, heightPt: shortSide };

  if (mode === "portrait") return portrait;
  if (mode === "landscape") return landscape;
  return pageLandscape ? landscape : portrait; // "auto" follows the document
}

function resolveMargins(paper: PrintPaperPreview, layout: PrintLayout, sheet: Size): Margins {
  let marginMm: number;
  if (layout.marginMode === "none") {
    marginMm = 0;
  } else if (layout.marginMode === "custom") {
    marginMm = Math.max(0, layout.customMarginMm);
  } else {
    // "default" — the printer's nominal printable inset.
    marginMm = (paper.marginPt || 3 * MM_TO_PT) / MM_TO_PT;
  }

  let pt = marginMm * MM_TO_PT;
  // Never collapse the printable area to nothing.
  pt = Math.max(0, Math.min(pt, sheet.widthPt / 2 - 1, sheet.heightPt / 2 - 1));
  return { top: pt, right: pt, bottom: pt, left: pt };
}

function resolveScale(page: Size, printable: Box, layout: PrintLayout): number {
  if (layout.scaleMode === "actual") return 1;
  if (layout.scaleMode === "custom") {
    return clamp(layout.customScalePercent, 10, 400) / 100;
  }
  // "fit" — scale (up or down) so the page fits fully inside the printable area.
  return Math.min(printable.widthPt / page.widthPt, printable.heightPt / page.heightPt);
}

function alignContent(printable: Box, width: number, height: number, align: PrintLayout["align"]) {
  if (align === "top-left") {
    return { xPt: printable.xPt, yPt: printable.yPt };
  }
  return {
    xPt: printable.xPt + (printable.widthPt - width) / 2,
    yPt: printable.yPt + (printable.heightPt - height) / 2
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// --- Layout plan (roadmap seam) ---------------------------------------------
// A plan maps each output sheet to the source page(s) it carries. Today it is a
// 1:1 identity mapping. N-Up, Booklet, Poster, and reverse/odd/even ordering are
// implemented by producing a different plan here while reusing computeSheetLayout
// for the placement of each cell — no other component needs to change.

export interface PlannedSheet {
  sheetIndex: number;
  sources: number[];
}

export function buildLayoutPlan(pageCount: number, _layout: PrintLayout): PlannedSheet[] {
  void _layout; // reserved: future layouts branch on _layout.pageLayout / pageSet / reverseOrder
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => ({
    sheetIndex: index,
    sources: [index + 1]
  }));
}

// Short human label describing a not-yet-implemented layout, or null for the
// standard one-page-per-sheet layout that ships tonight.
export function roadmapNotice(layout: PrintLayout): string | null {
  const labels: Record<Exclude<PrintLayout["pageLayout"], "single">, string> = {
    "n-up": "N-Up",
    booklet: "Booklet",
    "presentation-booklet": "Presentation Booklet",
    poster: "Poster",
    "book-fold": "Book Fold"
  };
  if (layout.pageLayout !== "single") {
    return `${labels[layout.pageLayout]} layout is coming soon — showing single-page preview.`;
  }
  return null;
}
