import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookMarked, ChevronDown, LayoutGrid, Plus, Star } from "lucide-react";
import { Icon, typography } from "@/design";
import { cn } from "@/lib/utils";
import { useProfiles } from "../hooks/useProfiles";
import { profileIcon } from "../profileIcons";
import { describeProfile, type PrintProfile } from "../profileTypes";

interface ProfileSelectorProps {
  onApply: (profile: PrintProfile) => void;
  onSaveCurrent: () => void;
  onOpenLibrary: () => void;
}

// One-click profile application from the Print Settings panel. Shows favourites,
// recently used, and built-in templates in a portal menu.
export function ProfileSelector({ onApply, onSaveCurrent, onOpenLibrary }: ProfileSelectorProps) {
  const profiles = useProfiles();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const groups = useMemo(() => {
    const user = profiles.filter((profile) => !profile.builtIn);
    return {
      favorites: user.filter((profile) => profile.favorite),
      recent: user
        .filter((profile) => profile.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt || "").localeCompare(a.lastUsedAt || ""))
        .slice(0, 4),
      templates: profiles.filter((profile) => profile.builtIn)
    };
  }, [profiles]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width });
    setOpen((value) => !value);
  }

  function apply(profile: PrintProfile) {
    onApply(profile);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded-md border border-edge-subtle bg-app px-3 py-2 text-left outline-none transition duration-fast ease-standard hover:border-edge focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Icon icon={BookMarked} className="text-ink-muted" />
        <span className={cn(typography.bodySmall, "flex-1 text-ink-secondary")}>Apply a print profile…</span>
        <Icon icon={ChevronDown} className="text-ink-muted" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", left: rect.left, top: rect.top, width: Math.max(rect.width, 260) }}
            className="z-[80] max-h-[60vh] overflow-auto rounded-lg border border-edge-subtle bg-elevated p-1 shadow-dialog"
          >
            {groups.favorites.length > 0 && (
              <MenuGroup title="Favorites">
                {groups.favorites.map((profile) => (
                  <MenuItem key={profile.id} profile={profile} onSelect={apply} showStar />
                ))}
              </MenuGroup>
            )}
            {groups.recent.length > 0 && (
              <MenuGroup title="Recently used">
                {groups.recent.map((profile) => (
                  <MenuItem key={profile.id} profile={profile} onSelect={apply} />
                ))}
              </MenuGroup>
            )}
            <MenuGroup title="Templates">
              {groups.templates.map((profile) => (
                <MenuItem key={profile.id} profile={profile} onSelect={apply} />
              ))}
            </MenuGroup>

            <div className="mt-1 grid gap-0.5 border-t border-edge-subtle pt-1">
              <FooterAction icon={Plus} label="Save current settings…" onClick={() => { setOpen(false); onSaveCurrent(); }} />
              <FooterAction icon={LayoutGrid} label="Open Profile Library" onClick={() => { setOpen(false); onOpenLibrary(); }} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 pb-1">
      <p className={cn(typography.labelCaps, "px-2 pt-1 text-ink-muted")}>{title}</p>
      {children}
    </div>
  );
}

function MenuItem({ profile, onSelect, showStar = false }: { profile: PrintProfile; onSelect: (profile: PrintProfile) => void; showStar?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => onSelect(profile)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Icon icon={profileIcon(profile.icon)} className="text-ink-muted" />
      <span className="min-w-0 flex-1">
        <span className={cn(typography.bodySmall, "block truncate text-ink")}>{profile.name}</span>
        <span className={cn(typography.caption, "block truncate text-ink-muted")}>{describeProfile(profile)}</span>
      </span>
      {showStar && <Icon icon={Star} size="xs" className="text-warning" />}
    </button>
  );
}

function FooterAction({ icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink-secondary outline-none transition hover:bg-white/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Icon icon={icon} />
      <span className={typography.bodySmall}>{label}</span>
    </button>
  );
}
