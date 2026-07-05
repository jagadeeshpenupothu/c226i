import { defaultPrintLayout, type PrintLayout } from "@/features/layout/types";
import type { PrintSettings } from "@/features/settings/types";
import { PROFILE_SCHEMA_VERSION, type PrintProfile, type ProfileCapabilitySnapshot, type ProfileCategory } from "./profileTypes";

const BUILT_IN_DATE = "2024-01-01T00:00:00.000Z";

const baseSettings: PrintSettings = {
  printerId: "",
  paperSize: "",
  paperWeight: "",
  tray: "",
  duplex: "",
  copies: 1,
  colorMode: "",
  quality: "",
  driverOptions: {}
};

// Built-in settings use intent keywords (e.g. "grayscale", "high") that the
// compatibility engine fuzzy-matches to each printer's real driver choices.
function builtIn(config: {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ProfileCategory;
  settings: Partial<PrintSettings>;
  layout?: Partial<PrintLayout>;
  snapshot?: Partial<ProfileCapabilitySnapshot>;
}): PrintProfile {
  return {
    id: `builtin-${config.id}`,
    name: config.name,
    description: config.description,
    icon: config.icon,
    category: config.category,
    favorite: false,
    builtIn: true,
    createdAt: BUILT_IN_DATE,
    usageCount: 0,
    settings: { ...baseSettings, ...config.settings },
    layout: { ...defaultPrintLayout, ...config.layout },
    capabilitySnapshot: {
      color: false,
      duplex: false,
      booklet: false,
      stapling: false,
      holePunch: false,
      paperSizes: [],
      ...config.snapshot
    },
    version: PROFILE_SCHEMA_VERSION
  };
}

// Read-only starter templates. Users duplicate these to customise.
export const DEFAULT_PROFILES: PrintProfile[] = [
  builtIn({
    id: "office-a4",
    name: "Office A4",
    description: "Everyday double-sided A4, auto color, normal quality.",
    icon: "briefcase",
    category: "office",
    settings: { paperSize: "a4", colorMode: "auto", duplex: "2sided", quality: "normal" },
    layout: { orientation: "auto", scaleMode: "fit", marginMode: "default" },
    snapshot: { duplex: true }
  }),
  builtIn({
    id: "draft",
    name: "Draft",
    description: "Fast, toner-saving grayscale, double-sided.",
    icon: "zap",
    category: "office",
    settings: { paperSize: "a4", colorMode: "grayscale", duplex: "2sided", quality: "draft" },
    layout: { scaleMode: "fit", marginMode: "default" },
    snapshot: { duplex: true }
  }),
  builtIn({
    id: "high-quality",
    name: "High Quality",
    description: "Best resolution, full color, single-sided.",
    icon: "sparkles",
    category: "quality",
    settings: { paperSize: "a4", colorMode: "color", duplex: "1sided", quality: "high" },
    layout: { scaleMode: "fit", marginMode: "default" },
    snapshot: { color: true }
  }),
  builtIn({
    id: "photo",
    name: "Photo Print",
    description: "Borderless full-color photo output at high quality.",
    icon: "image",
    category: "photo",
    settings: { paperSize: "a4", paperWeight: "photo", colorMode: "color", duplex: "1sided", quality: "high" },
    layout: { scaleMode: "fit", marginMode: "none" },
    snapshot: { color: true }
  }),
  builtIn({
    id: "booklet",
    name: "Booklet",
    description: "Double-sided booklet imposition on A4.",
    icon: "book",
    category: "finishing",
    settings: { paperSize: "a4", duplex: "2sided", quality: "normal" },
    layout: { orientation: "auto", scaleMode: "fit", pageLayout: "booklet" },
    snapshot: { duplex: true, booklet: true }
  }),
  builtIn({
    id: "poster",
    name: "Poster",
    description: "Large-format A3 poster output.",
    icon: "grid",
    category: "finishing",
    settings: { paperSize: "a3", colorMode: "color", quality: "high" },
    layout: { scaleMode: "fit", pageLayout: "poster" },
    snapshot: { color: true, paperSizes: ["a3"] }
  }),
  builtIn({
    id: "labels",
    name: "Labels",
    description: "Label media, single-sided, normal quality.",
    icon: "tag",
    category: "labels",
    settings: { paperSize: "a4", paperWeight: "labels", duplex: "1sided", quality: "normal" },
    layout: { scaleMode: "actual", marginMode: "custom", customMarginMm: 4 }
  }),
  builtIn({
    id: "certificates",
    name: "Certificates",
    description: "Heavy stock, full color, high quality with a wide margin.",
    icon: "award",
    category: "quality",
    settings: { paperSize: "a4", paperWeight: "cardstock", colorMode: "color", duplex: "1sided", quality: "high" },
    layout: { scaleMode: "fit", marginMode: "custom", customMarginMm: 12 },
    snapshot: { color: true }
  })
];
