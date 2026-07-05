import { useMemo, useRef, useState } from "react";
import { Check, LayoutGrid, List, Save, Upload, X } from "lucide-react";
import { Button, Icon, IconButton, Input, SearchBox, Select, typography } from "@/design";
import { cn } from "@/lib/utils";
import { notify } from "@/features/printers";
import type { PrintLayout } from "@/features/layout/types";
import type { PrintSettings } from "@/features/settings/types";
import { useProfiles } from "../hooks/useProfiles";
import { profileManager } from "../profileManager";
import { PROFILE_ICON_KEYS, profileIcon } from "../profileIcons";
import type { PrintProfile, ProfileCapabilitySnapshot, ProfileCategory } from "../profileTypes";
import { ProfileCard } from "./ProfileCard";

type Tab = "all" | "favorites" | "recent" | "templates";

export interface ProfileLibraryConfig {
  settings: PrintSettings;
  layout: PrintLayout;
  printerId?: string;
  printerName?: string;
  capabilitySnapshot?: ProfileCapabilitySnapshot;
}

interface ProfileLibraryProps {
  onClose: () => void;
  onApply: (profile: PrintProfile) => void;
  currentConfig: ProfileLibraryConfig;
}

const CATEGORIES: ProfileCategory[] = ["custom", "office", "quality", "photo", "finishing", "labels"];

export function ProfileLibrary({ onClose, onApply, currentConfig }: ProfileLibraryProps) {
  const profiles = useProfiles();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [grid, setGrid] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byTab = profiles.filter((profile) => {
      if (tab === "favorites") return !profile.builtIn && profile.favorite;
      if (tab === "templates") return profile.builtIn;
      if (tab === "recent") return !profile.builtIn && Boolean(profile.lastUsedAt);
      return true;
    });
    const searched = query ? byTab.filter((profile) => `${profile.name} ${profile.description || ""} ${profile.category}`.toLowerCase().includes(query)) : byTab;
    if (tab === "recent") return [...searched].sort((a, b) => (b.lastUsedAt || "").localeCompare(a.lastUsedAt || ""));
    return searched;
  }, [profiles, tab, search]);

  function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    file.text().then((text) => {
      const result = profileManager.importProfiles(text);
      if (result.added > 0) {
        notify({ type: "info", severity: "success", title: "Profiles imported", message: `Imported ${result.added} profile${result.added > 1 ? "s" : ""}.` });
      } else {
        notify({ type: "info", severity: "warning", title: "Nothing imported", message: result.errors[0] || "No profiles were imported." });
      }
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "favorites", label: "Favorites" },
    { id: "recent", label: "Recent" },
    { id: "templates", label: "Templates" }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" role="dialog" aria-modal="true" aria-label="Profile library">
      <div className="flex h-[82vh] w-[82vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-edge-subtle bg-elevated shadow-dialog">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-edge-subtle px-5 py-3">
          <div>
            <h2 className={cn(typography.headingM, "text-ink")}>Print Profiles</h2>
            <p className={cn(typography.caption, "text-ink-muted")}>Save, reuse, and share complete print configurations.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" leadingIcon={Upload} onClick={() => fileInputRef.current?.click()}>
              Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                download("printpilot-profiles.json", profileManager.exportAll());
                notify({ type: "info", severity: "success", title: "Profiles exported", message: "Saved printpilot-profiles.json." });
              }}
            >
              Export all
            </Button>
            <IconButton icon={X} label="Close" onClick={onClose} />
            <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge-subtle px-5 py-2.5">
          <SearchBox aria-label="Search profiles" placeholder="Search profiles" value={search} onChange={setSearch} className="min-w-[180px] max-w-xs flex-1" />
          <div className="flex items-center gap-0.5">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={cn(
                  "h-8 rounded-md px-3 text-[13px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-brand",
                  tab === entry.id ? "bg-brand-soft text-brand" : "text-ink-secondary hover:bg-white/10 hover:text-ink"
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <IconButton icon={grid ? List : LayoutGrid} label={grid ? "List view" : "Grid view"} size="sm" onClick={() => setGrid((value) => !value)} />
            <Button variant={saving ? "primary" : "secondary"} size="sm" leadingIcon={Save} onClick={() => setSaving((value) => !value)}>
              Save current
            </Button>
          </div>
        </div>

        {saving && (
          <SaveForm
            currentConfig={currentConfig}
            onSaved={(name) => {
              setSaving(false);
              notify({ type: "info", severity: "success", title: "Profile saved", message: `“${name}” saved to your library.` });
            }}
            onCancel={() => setSaving(false)}
          />
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {filtered.length === 0 ? (
            <p className={cn(typography.body, "grid place-items-center py-12 text-center text-ink-muted")}>No profiles here yet.</p>
          ) : (
            <div className={grid ? "grid gap-3 sm:grid-cols-2 laptop:grid-cols-3" : "grid gap-2"}>
              {filtered.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onApply={onApply}
                  onDuplicate={(target) => profileManager.duplicate(target.id)}
                  onExport={(target) => {
                    download(`${slug(target.name)}.json`, profileManager.exportProfiles([target]));
                    notify({ type: "info", severity: "success", title: "Profile exported", message: `Saved ${slug(target.name)}.json.` });
                  }}
                  onToggleFavorite={profile.builtIn ? undefined : (target) => profileManager.toggleFavorite(target.id)}
                  onRename={profile.builtIn ? undefined : (target, name) => profileManager.rename(target.id, name)}
                  onDelete={profile.builtIn ? undefined : (target) => profileManager.delete(target.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveForm({ currentConfig, onSaved, onCancel }: { currentConfig: ProfileLibraryConfig; onSaved: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("file");
  const [category, setCategory] = useState<ProfileCategory>("custom");

  function save() {
    if (!name.trim()) return;
    profileManager.create({
      name,
      description,
      icon,
      category,
      settings: currentConfig.settings,
      layout: currentConfig.layout,
      printerId: currentConfig.printerId,
      printerName: currentConfig.printerName,
      capabilitySnapshot: currentConfig.capabilitySnapshot
    });
    onSaved(name.trim());
  }

  return (
    <div className="shrink-0 border-b border-edge-subtle bg-white/[0.02] px-5 py-3">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Profile name" placeholder="Profile name (e.g. Office Duplex)" className="min-w-[200px] flex-1" value={name} onChange={(event) => setName(event.target.value)} />
          <Select aria-label="Category" className="h-8 w-40" value={category} onChange={(event) => setCategory(event.target.value as ProfileCategory)}>
            {CATEGORIES.map((entry) => (
              <option key={entry} value={entry}>
                {entry.charAt(0).toUpperCase() + entry.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <Input aria-label="Description" placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
        <div className="flex items-center gap-1.5">
          {PROFILE_ICON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={`Icon ${key}`}
              onClick={() => setIcon(key)}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md border outline-none transition focus-visible:ring-2 focus-visible:ring-brand",
                icon === key ? "border-brand bg-brand-soft text-brand" : "border-edge-subtle text-ink-muted hover:text-ink"
              )}
            >
              <Icon icon={profileIcon(key)} size="sm" />
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" leadingIcon={Check} disabled={!name.trim()} onClick={save}>
              Save profile
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function download(filename: string, text: string) {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "profile";
}
