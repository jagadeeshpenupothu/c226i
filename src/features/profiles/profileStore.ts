import { defaultPrintLayout } from "@/features/layout/types";
import { PROFILE_SCHEMA_VERSION, type PrintProfile } from "./profileTypes";

const STORAGE_KEY = "printpilot.profiles.v2";
const LEGACY_KEY = "printpilot.profiles";

// Reactive single source of truth for USER profiles (built-ins are static, in
// code). Persists to localStorage and migrates the pre-Phase-6 profile shape.
class ProfileStore {
  private profiles: PrintProfile[];
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.profiles = this.load();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getSnapshot = (): PrintProfile[] => this.profiles;

  getById(id: string): PrintProfile | undefined {
    return this.profiles.find((profile) => profile.id === id);
  }

  private set(profiles: PrintProfile[]): void {
    this.profiles = profiles;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // ignore quota / private-mode errors
    }
    this.listeners.forEach((listener) => listener());
  }

  upsert(profile: PrintProfile): void {
    const exists = this.profiles.some((entry) => entry.id === profile.id);
    this.set(exists ? this.profiles.map((entry) => (entry.id === profile.id ? profile : entry)) : [profile, ...this.profiles]);
  }
  remove(id: string): void {
    this.set(this.profiles.filter((entry) => entry.id !== id));
  }

  private load(): PrintProfile[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(parsed)) return parsed as PrintProfile[];
    } catch {
      // fall through to migration
    }
    return this.migrateLegacy();
  }

  // Converts old `{ id, name, settings }` profiles into the rich shape. Keeps the
  // legacy key intact for safety; writes v2 so migration runs only once.
  private migrateLegacy(): PrintProfile[] {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
      if (!Array.isArray(legacy) || legacy.length === 0) return [];
      const now = new Date().toISOString();
      const migrated: PrintProfile[] = legacy
        .filter((entry) => entry && typeof entry.name === "string" && entry.settings)
        .map((entry, index) => ({
          id: typeof entry.id === "string" ? entry.id : `migrated-${index}`,
          name: entry.name,
          description: "Imported from a previous version.",
          icon: "file",
          category: "custom" as const,
          favorite: false,
          builtIn: false,
          createdAt: now,
          usageCount: 0,
          settings: { ...entry.settings, driverOptions: entry.settings.driverOptions || {} },
          layout: { ...defaultPrintLayout },
          version: PROFILE_SCHEMA_VERSION
        }));
      if (migrated.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    } catch {
      return [];
    }
  }
}

export const profileStore = new ProfileStore();
