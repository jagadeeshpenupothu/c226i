import type { PrinterCapabilities } from "@/features/printers/types";
import type { PrintLayout } from "@/features/layout/types";
import type { PrintSettings } from "@/features/settings/types";
import { DEFAULT_PROFILES } from "./defaultProfiles";
import { resolveProfileApplication, type ProfileApplication } from "./profileCompatibility";
import { profileStore } from "./profileStore";
import { PROFILE_SCHEMA_VERSION, type PrintProfile, type ProfileCapabilitySnapshot, type ProfileCategory, type ProfileExport } from "./profileTypes";

let sequence = 0;
function newProfileId(): string {
  sequence += 1;
  return `profile-${Date.now().toString(36)}-${sequence}`;
}

export interface CreateProfileInput {
  name: string;
  description?: string;
  icon?: string;
  category?: ProfileCategory;
  settings: PrintSettings;
  layout: PrintLayout;
  printerId?: string;
  printerName?: string;
  capabilitySnapshot?: ProfileCapabilitySnapshot;
}

export interface ImportResult {
  added: number;
  errors: string[];
}

// Orchestrates profiles: built-in templates + user profiles, CRUD, duplication,
// import/export, favourite/usage tracking, and compatibility resolution. Built-ins
// are read-only (favourite/usage/edit are no-ops on them — duplicate to customise).
class ProfileManager {
  getBuiltIns(): PrintProfile[] {
    return DEFAULT_PROFILES;
  }
  getUserProfiles(): PrintProfile[] {
    return profileStore.getSnapshot();
  }
  getAll(): PrintProfile[] {
    return [...DEFAULT_PROFILES, ...profileStore.getSnapshot()];
  }
  getById(id: string): PrintProfile | undefined {
    return this.getAll().find((profile) => profile.id === id);
  }

  create(input: CreateProfileInput): PrintProfile {
    const now = new Date().toISOString();
    const profile: PrintProfile = {
      id: newProfileId(),
      name: input.name.trim() || "Untitled profile",
      description: input.description?.trim() || undefined,
      icon: input.icon || "file",
      category: input.category || "custom",
      favorite: false,
      builtIn: false,
      createdAt: now,
      usageCount: 0,
      printerId: input.printerId,
      printerName: input.printerName,
      capabilitySnapshot: input.capabilitySnapshot,
      settings: { ...input.settings, driverOptions: { ...input.settings.driverOptions } },
      layout: { ...input.layout },
      version: PROFILE_SCHEMA_VERSION
    };
    profileStore.upsert(profile);
    return profile;
  }

  update(id: string, patch: Partial<PrintProfile>): void {
    const profile = profileStore.getById(id);
    if (!profile || profile.builtIn) return;
    profileStore.upsert({ ...profile, ...patch });
  }
  rename(id: string, name: string): void {
    if (name.trim()) this.update(id, { name: name.trim() });
  }
  delete(id: string): void {
    profileStore.remove(id);
  }
  duplicate(id: string): PrintProfile | null {
    const source = this.getById(id);
    if (!source) return null;
    return this.create({
      name: `${source.name} copy`,
      description: source.description,
      icon: source.icon,
      category: source.builtIn ? "custom" : source.category,
      settings: source.settings,
      layout: source.layout,
      printerId: source.printerId,
      printerName: source.printerName,
      capabilitySnapshot: source.capabilitySnapshot
    });
  }
  toggleFavorite(id: string): void {
    const profile = profileStore.getById(id);
    if (!profile) return; // built-ins aren't in the store — duplicate to favourite
    profileStore.upsert({ ...profile, favorite: !profile.favorite });
  }
  recordUse(id: string): void {
    const profile = profileStore.getById(id);
    if (!profile) return;
    profileStore.upsert({ ...profile, usageCount: profile.usageCount + 1, lastUsedAt: new Date().toISOString() });
  }

  // Compatibility resolution for applying a profile — see profileCompatibility.
  resolveApplication(profile: PrintProfile, capabilities: PrinterCapabilities | null): ProfileApplication {
    return resolveProfileApplication(profile, capabilities);
  }

  search(query: string): PrintProfile[] {
    const normalized = query.trim().toLowerCase();
    const all = this.getAll();
    if (!normalized) return all;
    return all.filter((profile) => `${profile.name} ${profile.description || ""} ${profile.category}`.toLowerCase().includes(normalized));
  }

  // --- Import / export (JSON, versioned) ---
  exportProfiles(profiles: PrintProfile[]): string {
    const envelope: ProfileExport = {
      app: "printpilot",
      kind: "print-profiles",
      version: PROFILE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      profiles
    };
    return JSON.stringify(envelope, null, 2);
  }
  exportAll(): string {
    return this.exportProfiles(this.getUserProfiles());
  }
  importProfiles(json: string): ImportResult {
    try {
      const parsed = JSON.parse(json);
      const list: unknown[] = Array.isArray(parsed) ? parsed : parsed?.profiles;
      if (!Array.isArray(list)) return { added: 0, errors: ["No profiles found in the file."] };
      let added = 0;
      for (const raw of list) {
        const candidate = raw as Partial<PrintProfile>;
        if (!candidate?.name || !candidate.settings || !candidate.layout) continue;
        this.create({
          name: candidate.name,
          description: candidate.description,
          icon: candidate.icon,
          category: candidate.category,
          settings: candidate.settings,
          layout: candidate.layout,
          printerId: candidate.printerId,
          printerName: candidate.printerName,
          capabilitySnapshot: candidate.capabilitySnapshot
        });
        added += 1;
      }
      return { added, errors: added === 0 ? ["No valid profiles to import."] : [] };
    } catch (error) {
      return { added: 0, errors: [String(error)] };
    }
  }
}

export const profileManager = new ProfileManager();
