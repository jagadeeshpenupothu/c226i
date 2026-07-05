import { summarizeCapabilities } from "@/features/printers/printerCapabilities";
import type { CapabilityChoice, PrinterCapabilities } from "@/features/printers/types";
import type { PrintLayout } from "@/features/layout/types";
import type { PrintSettings } from "@/features/settings/types";
import { paperDimensionsMm } from "@/services/layout/paper";
import type { PrintProfile } from "./profileTypes";

export interface CompatibilityWarning {
  field: string;
  requested: string;
  applied: string;
  message: string;
}

export interface ProfileApplication {
  settings: PrintSettings;
  layout: PrintLayout;
  warnings: CompatibilityWarning[];
}

// Intent → synonym patterns, so built-in/portable profiles map onto whatever
// keywords a given driver actually uses.
const COLOR_SYNONYMS: Record<string, RegExp> = {
  grayscale: /gray|grey|mono|black|b&?w/i,
  color: /colou?r|rgb|cmyk/i,
  auto: /auto/i
};
const DUPLEX_SYNONYMS: Record<string, RegExp> = {
  "2sided": /2.?sided|two.?sided|double|duplex|long.?edge|short.?edge/i,
  "1sided": /1.?sided|one.?sided|single|simplex|off|none/i
};
const QUALITY_SYNONYMS: Record<string, RegExp> = {
  draft: /draft|fast|econo|low|300/i,
  high: /high|fine|best|photo|1200|2400/i,
  normal: /normal|standard|default|600/i
};
const MEDIA_SYNONYMS: Record<string, RegExp> = {
  photo: /photo|gloss|coat|inkjet/i,
  labels: /label/i,
  cardstock: /card|cover|heavy|thick|bond|index/i,
  plain: /plain|normal|standard/i
};

function labelFor(value: string, choices: CapabilityChoice[]): string {
  return choices.find((choice) => choice.value === value)?.label || value;
}
function defaultOf(choices: CapabilityChoice[]): string {
  return choices.find((choice) => choice.isDefault)?.value || choices[0]?.value || "";
}
function isExact(value: string, choices: CapabilityChoice[]): boolean {
  return choices.some((choice) => choice.value === value);
}
function fuzzy(value: string, choices: CapabilityChoice[], synonyms: Record<string, RegExp>): string | null {
  const pattern = synonyms[value.toLowerCase()];
  if (!pattern) return null;
  const match = choices.find((choice) => pattern.test(`${choice.label} ${choice.value}`));
  return match?.value ?? null;
}

// Resolves a requested choice to something the printer supports. Exact match or a
// synonym match honours intent silently; otherwise falls back to default + warns.
function resolveChoice(
  field: string,
  requested: string,
  choices: CapabilityChoice[],
  synonyms: Record<string, RegExp>,
  warnings: CompatibilityWarning[]
): string {
  if (!requested || choices.length === 0) return requested;
  if (isExact(requested, choices)) return requested;
  const matched = fuzzy(requested, choices, synonyms);
  if (matched) return matched;
  const fallback = defaultOf(choices);
  warnings.push({
    field,
    requested,
    applied: labelFor(fallback, choices),
    message: `${field} “${requested}” isn't supported — using “${labelFor(fallback, choices)}”.`
  });
  return fallback;
}

// Resolves paper size to the exact match, else the nearest available size by area.
function resolvePaperSize(requested: string, choices: CapabilityChoice[], warnings: CompatibilityWarning[]): string {
  if (!requested || choices.length === 0) return requested;
  if (isExact(requested, choices)) return requested;
  const target = paperDimensionsMm(requested);
  if (target) {
    const targetArea = target.width * target.height;
    let best: CapabilityChoice | null = null;
    let bestScore = Infinity;
    for (const choice of choices) {
      const dims = paperDimensionsMm(choice.value) || paperDimensionsMm(choice.label);
      if (!dims) continue;
      const score = Math.abs(dims.width * dims.height - targetArea);
      if (score < bestScore) {
        bestScore = score;
        best = choice;
      }
    }
    if (best) {
      warnings.push({ field: "Paper Size", requested, applied: best.label, message: `Paper size “${requested}” isn't available — using the nearest size “${best.label}”.` });
      return best.value;
    }
  }
  const fallback = defaultOf(choices);
  warnings.push({ field: "Paper Size", requested, applied: labelFor(fallback, choices), message: `Paper size “${requested}” isn't available — using “${labelFor(fallback, choices)}”.` });
  return fallback;
}

// The compatibility engine. Produces printer-safe settings + the profile's layout
// (layout is printer-independent) plus a list of everything that was adjusted. The
// profile itself is never mutated, so unsupported values are preserved internally.
export function resolveProfileApplication(profile: PrintProfile, capabilities: PrinterCapabilities | null): ProfileApplication {
  const layout: PrintLayout = { ...profile.layout };

  // Without capabilities (e.g. no printer) we can't validate — apply as-is.
  if (!capabilities) {
    return { settings: { ...profile.settings, driverOptions: { ...profile.settings.driverOptions } }, layout, warnings: [] };
  }

  const warnings: CompatibilityWarning[] = [];
  const source = profile.settings;
  const settings: PrintSettings = {
    ...source,
    driverOptions: { ...source.driverOptions },
    paperSize: resolvePaperSize(source.paperSize, capabilities.paperSizes, warnings),
    paperWeight: resolveChoice("Paper Type", source.paperWeight, capabilities.paperTypes, MEDIA_SYNONYMS, warnings),
    tray: resolveChoice("Tray", source.tray, capabilities.trays, {}, warnings),
    colorMode: resolveChoice("Color Mode", source.colorMode, capabilities.colorModes, COLOR_SYNONYMS, warnings),
    duplex: resolveChoice("Duplex", source.duplex, capabilities.duplexModes, DUPLEX_SYNONYMS, warnings),
    quality: resolveChoice("Print Quality", source.quality, capabilities.resolutions, QUALITY_SYNONYMS, warnings)
  };

  // Feature-level warnings (finishing/color the current printer can't do).
  const summary = summarizeCapabilities(capabilities);
  const snapshot = profile.capabilitySnapshot;
  if (snapshot) {
    if (snapshot.booklet && !summary.booklet) warnings.push({ field: "Booklet", requested: "Booklet", applied: "Not applied", message: "Booklet finishing isn't available on this printer." });
    if (snapshot.stapling && !summary.stapling) warnings.push({ field: "Stapling", requested: "Stapling", applied: "Not applied", message: "Stapling isn't available on this printer." });
    if (snapshot.holePunch && !summary.holePunch) warnings.push({ field: "Hole Punch", requested: "Hole Punch", applied: "Not applied", message: "Hole punching isn't available on this printer." });
    if (snapshot.color && !summary.color) warnings.push({ field: "Color", requested: "Color", applied: "Black & White", message: "This printer prints in black & white only." });
  }

  return { settings, layout, warnings };
}
