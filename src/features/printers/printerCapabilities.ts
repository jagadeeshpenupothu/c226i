import { getPrinterCapabilities } from "./api";
import type { PrinterCapabilities } from "./types";
import type { PrinterCapabilitySummary } from "./printerTypes";

// The single capability-detection entry point. Wraps the unchanged
// get_printer_capabilities API.
export async function detectCapabilities(printerId: string): Promise<PrinterCapabilities> {
  return getPrinterCapabilities(printerId);
}

function textOf(caps: PrinterCapabilities): string {
  return (caps.driverCapabilities || [])
    .flatMap((cap) => [cap.option.keyword, cap.option.displayName, ...(cap.searchKeywords || [])])
    .join(" ")
    .toLowerCase();
}

function hasColor(caps: PrinterCapabilities): boolean {
  return caps.colorModes.some((choice) => /colou?r|rgb|cmyk|full.?color/i.test(`${choice.label} ${choice.value}`));
}

function hasDuplex(caps: PrinterCapabilities): boolean {
  return caps.duplexModes.some((choice) => /2.?sided|two.?sided|double|duplex|long.?edge|short.?edge/i.test(`${choice.label} ${choice.value}`));
}

// Rolls a printer's capabilities up into booleans/counts the UI can adapt to.
// Everything is derived from what the driver actually reports — nothing invented.
export function summarizeCapabilities(caps: PrinterCapabilities): PrinterCapabilitySummary {
  const text = textOf(caps);
  return {
    color: hasColor(caps),
    duplex: hasDuplex(caps),
    paperSizes: caps.paperSizes.length,
    trays: caps.trays.length,
    resolutions: caps.resolutions.length,
    booklet: /booklet|saddle|book.?fold/.test(text),
    stapling: /stapl/.test(text),
    holePunch: /punch|hole/.test(text),
    borderless: /borderless|edge.?to.?edge|full.?bleed/.test(text)
  };
}
