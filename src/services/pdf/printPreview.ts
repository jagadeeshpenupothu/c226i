import type { CapabilityChoice } from "@/features/printers/types";
import type { PrintSettings } from "@/features/settings/types";

export interface PrintPaperPreview {
  label: string;
  widthPt: number;
  heightPt: number;
  marginPt: number;
}

const MM_TO_PT = 72 / 25.4;

const PAPER_DIMENSIONS_MM: Record<string, { width: number; height: number }> = {
  a3: { width: 297, height: 420 },
  a3jis: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  a4jis: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  a5jis: { width: 148, height: 210 },
  letter: { width: 216, height: 279 },
  "8.5x11": { width: 216, height: 279 },
  legal: { width: 216, height: 356 },
  "8.5x14": { width: 216, height: 356 },
  executive: { width: 184, height: 267 },
  statement: { width: 140, height: 216 },
  tabloid: { width: 279, height: 432 },
  ledger: { width: 432, height: 279 },
  env10: { width: 105, height: 241 },
  com10: { width: 105, height: 241 },
  envelope10: { width: 105, height: 241 },
  dl: { width: 110, height: 220 },
  envdl: { width: 110, height: 220 },
  c5: { width: 162, height: 229 },
  envc5: { width: 162, height: 229 },
  c6: { width: 114, height: 162 },
  envc6: { width: 114, height: 162 },
  monarch: { width: 98, height: 191 }
};

export function resolvePrintPaperPreview(
  settings: PrintSettings,
  paperChoices: CapabilityChoice[] | undefined
): PrintPaperPreview | null {
  const selected = paperChoices?.find((choice) => choice.value === settings.paperSize);
  const selectedName = selected?.value || selected?.label || settings.paperSize;
  const key = normalizePaperKey(selectedName);
  const dimensions = PAPER_DIMENSIONS_MM[key] || parseCustomPaperDimensions(selectedName);

  if (!dimensions) return null;

  return {
    label: selected?.label || settings.paperSize,
    widthPt: dimensions.width * MM_TO_PT,
    heightPt: dimensions.height * MM_TO_PT,
    marginPt: 3 * MM_TO_PT
  };
}

function normalizePaperKey(value: string) {
  return value
    .toLowerCase()
    .replace(/jis/g, "jis")
    .replace(/[^a-z0-9.]+/g, "")
    .replace("letter", "letter")
    .replace("legal", "legal");
}

function parseCustomPaperDimensions(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  return { width, height };
}
