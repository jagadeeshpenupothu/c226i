import { useState } from "react";
import { Copy, Download, Pencil, Star, Trash2 } from "lucide-react";
import { Badge, Button, Icon, IconButton, Input, typography } from "@/design";
import { cn } from "@/lib/utils";
import { profileIcon } from "../profileIcons";
import { describeProfile, type PrintProfile } from "../profileTypes";

interface ProfileCardProps {
  profile: PrintProfile;
  onApply: (profile: PrintProfile) => void;
  onDuplicate: (profile: PrintProfile) => void;
  onToggleFavorite?: (profile: PrintProfile) => void;
  onRename?: (profile: PrintProfile, name: string) => void;
  onDelete?: (profile: PrintProfile) => void;
  onExport?: (profile: PrintProfile) => void;
}

export function ProfileCard({ profile, onApply, onDuplicate, onToggleFavorite, onRename, onDelete, onExport }: ProfileCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(profile.name);

  function commitRename() {
    if (onRename && draft.trim()) onRename(profile, draft.trim());
    setRenaming(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-edge-subtle bg-white/[0.02] p-3">
      <div className="flex items-start gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand ring-1 ring-edge-subtle">
          <Icon icon={profileIcon(profile.icon)} />
        </div>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <Input
              autoFocus
              aria-label="Profile name"
              className="h-7"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") setRenaming(false);
              }}
              onBlur={commitRename}
            />
          ) : (
            <p className={cn(typography.label, "truncate text-ink")} title={profile.name}>
              {profile.name}
            </p>
          )}
          <p className={cn(typography.caption, "truncate text-ink-muted")}>{describeProfile(profile)}</p>
        </div>
        {onToggleFavorite && (
          <IconButton
            icon={Star}
            label={profile.favorite ? "Unfavorite" : "Favorite"}
            size="sm"
            onClick={() => onToggleFavorite(profile)}
            className={profile.favorite ? "text-warning" : ""}
          />
        )}
      </div>

      {profile.description && <p className={cn(typography.caption, "line-clamp-2 text-ink-muted")}>{profile.description}</p>}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          {profile.builtIn ? <Badge tone="neutral">Template</Badge> : <Badge tone="brand">{profile.usageCount} uses</Badge>}
        </div>
        <div className="flex items-center gap-0.5">
          {onExport && <IconButton icon={Download} label="Export" size="sm" onClick={() => onExport(profile)} />}
          {onRename && <IconButton icon={Pencil} label="Rename" size="sm" onClick={() => setRenaming(true)} />}
          <IconButton icon={Copy} label="Duplicate" size="sm" onClick={() => onDuplicate(profile)} />
          {onDelete && <IconButton icon={Trash2} label="Delete" size="sm" onClick={() => onDelete(profile)} />}
          <Button variant="primary" size="sm" onClick={() => onApply(profile)}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
