import type { CapabilityChoice } from "@/features/printers/types";

// Single source of truth for physical paper dimensions (portrait, millimetres).
// Used both to resolve a selected paper into points for the preview and to offer
// a sensible paper list when no printer is connected (No Printer Mode).
export const PAPER_SIZES_MM: Record<string, { width: number; height: number }> = {
  a3: { width: 297, height: 420 },
  a3jis: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  a4jis: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  a5jis: { width: 148, height: 210 },
  a6: { width: 105, height: 148 },
  b4: { width: 250, height: 353 },
  b5: { width: 176, height: 250 },
  jisb4: { width: 257, height: 364 },
  jisb5: { width: 182, height: 257 },
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

// Offered when a printer has not reported its own media list yet. Values map to
// PAPER_SIZES_MM keys so the preview resolves them without a driver.
export const FALLBACK_PAPER_CHOICES: CapabilityChoice[] = [
  { value: "a4", label: "A4 (210 × 297 mm)", isDefault: true },
  { value: "a3", label: "A3 (297 × 420 mm)", isDefault: false },
  { value: "a5", label: "A5 (148 × 210 mm)", isDefault: false },
  { value: "b5", label: "B5 (176 × 250 mm)", isDefault: false },
  { value: "letter", label: "Letter (8.5 × 11 in)", isDefault: false },
  { value: "legal", label: "Legal (8.5 × 14 in)", isDefault: false },
  { value: "tabloid", label: "Tabloid (11 × 17 in)", isDefault: false },
  { value: "executive", label: "Executive (7.25 × 10.5 in)", isDefault: false }
];

export function normalizePaperKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, "");
}

// Resolves a paper name (a CUPS keyword, a fallback value, or free text like
// "210x297") into millimetre dimensions, or null when unrecognisable.
export function paperDimensionsMm(value: string): { width: number; height: number } | null {
  const key = normalizePaperKey(value);
  if (PAPER_SIZES_MM[key]) return PAPER_SIZES_MM[key];

  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  return { width, height };
}
