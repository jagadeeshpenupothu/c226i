import type { CapabilityChoice } from "@/features/printers/types";
import type { PrintSettings } from "@/features/settings/types";
import { paperDimensionsMm } from "@/services/layout/paper";

export interface PrintPaperPreview {
  label: string;
  widthPt: number;
  heightPt: number;
  marginPt: number;
}

const MM_TO_PT = 72 / 25.4;

export function resolvePrintPaperPreview(
  settings: PrintSettings,
  paperChoices: CapabilityChoice[] | undefined
): PrintPaperPreview | null {
  const selected = paperChoices?.find((choice) => choice.value === settings.paperSize);
  const selectedName = selected?.value || selected?.label || settings.paperSize;
  const dimensions = paperDimensionsMm(selectedName);

  if (!dimensions) return null;

  return {
    label: selected?.label || settings.paperSize,
    widthPt: dimensions.width * MM_TO_PT,
    heightPt: dimensions.height * MM_TO_PT,
    // Nominal printer printable inset used as the "Default" margin in the preview.
    marginPt: 3 * MM_TO_PT
  };
}
