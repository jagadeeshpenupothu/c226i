import type { PrintLayout } from "@/features/layout/types";
import type { PrintSettings } from "@/features/settings/types";

export const PROFILE_SCHEMA_VERSION = 1;

export type ProfileCategory = "office" | "quality" | "photo" | "finishing" | "labels" | "custom";

// The features a profile expects, captured when it was saved (or declared by a
// built-in). Used by the compatibility engine to warn when the current printer
// can't honour them. `paperSizes` are capability values, for nearest-size matching.
export interface ProfileCapabilitySnapshot {
  color: boolean;
  duplex: boolean;
  booklet: boolean;
  stapling: boolean;
  holePunch: boolean;
  paperSizes: string[];
}

// A complete, reproducible print configuration. Stores the full settings + layout
// so applying it restores everything. Extensible via `metadata`.
export interface PrintProfile {
  id: string;
  name: string;
  description?: string;
  /** Icon key (see profileIcons.ts), not a component. */
  icon: string;
  category: ProfileCategory;
  favorite: boolean;
  /** Read-only built-in template. */
  builtIn: boolean;
  createdAt: string;
  lastUsedAt?: string;
  usageCount: number;
  /** The printer this profile was saved for (informational — apply never force-switches). */
  printerId?: string;
  printerName?: string;
  capabilitySnapshot?: ProfileCapabilitySnapshot;
  settings: PrintSettings;
  layout: PrintLayout;
  /** Reserved for future custom metadata (tags, team, sync ids…). */
  metadata?: Record<string, unknown>;
  version: number;
}

// Versioned envelope for import/export (JSON) — future-proof for cloud sync.
export interface ProfileExport {
  app: "printpilot";
  kind: "print-profiles";
  version: number;
  exportedAt: string;
  profiles: PrintProfile[];
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

// A short, human summary of what a profile configures — for cards and menus.
export function describeProfile(profile: PrintProfile): string {
  const parts = [
    profile.settings.paperSize ? profile.settings.paperSize.toUpperCase() : "",
    capitalize(profile.settings.colorMode),
    capitalize(profile.settings.duplex),
    capitalize(profile.settings.quality),
    profile.layout.marginMode === "none" ? "Borderless" : "",
    profile.layout.pageLayout !== "single" ? capitalize(profile.layout.pageLayout) : ""
  ].filter(Boolean);
  return parts.join(" · ") || "Default settings";
}
