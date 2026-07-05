import { Cloud, CloudOff, Loader2, RefreshCw, AlertTriangle, GitMerge, type LucideIcon } from "lucide-react";
import { Icon, typography } from "@/design";
import { cn } from "@/lib/utils";
import { useSyncState } from "../hooks/useCloud";
import type { SyncStatus } from "../sync/syncTypes";

// Presentational cloud/sync status pill. Provider-agnostic — it reads only the
// abstract SyncState. This is the UI extension point for the next phase; it is
// intentionally NOT mounted anywhere yet, so the app is visually unchanged.
const STATUS: Record<SyncStatus, { icon: LucideIcon; label: string; className: string }> = {
  online: { icon: Cloud, label: "Synced", className: "text-success" },
  idle: { icon: Cloud, label: "Up to date", className: "text-ink-muted" },
  offline: { icon: CloudOff, label: "Offline", className: "text-ink-muted" },
  syncing: { icon: Loader2, label: "Syncing…", className: "text-info" },
  waiting: { icon: RefreshCw, label: "Pending", className: "text-warning" },
  failed: { icon: AlertTriangle, label: "Sync failed", className: "text-error" },
  conflict: { icon: GitMerge, label: "Conflict", className: "text-warning" }
};

export function CloudStatusBadge() {
  const sync = useSyncState();
  const meta = STATUS[sync.status];
  const suffix = sync.pendingOperations > 0 ? ` · ${sync.pendingOperations}` : "";

  return (
    <span className={cn("inline-flex items-center gap-1.5", meta.className)}>
      <Icon icon={meta.icon} size="xs" className={sync.status === "syncing" ? "animate-spin" : undefined} />
      <span className={typography.caption}>
        {meta.label}
        {suffix}
      </span>
    </span>
  );
}
