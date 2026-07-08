import { AlertTriangle, CheckCircle2, Cloud, Loader2, RefreshCw } from "lucide-react";
import { Button, typography } from "@/design";
import { cn } from "@/lib/utils";
import { cloudDocumentService } from "../documents/cloudDocumentService";
import { useCurrentDocumentCloudState } from "../documents/hooks";

export function DocumentCloudBadge({ path }: { path?: string }) {
  const state = useCurrentDocumentCloudState();
  if (!path || !state || state.localPath !== path) return null;

  const failed = state.state === "failed" || state.state === "quotaExceeded";
  const synced = state.state === "synced" || state.state === "duplicate";
  const label = failed
    ? state.state === "quotaExceeded"
      ? "Storage quota exceeded"
      : "Cloud upload failed"
    : synced
      ? state.message || "Saved to Cloud"
      : state.state === "uploading" && state.progress !== null
        ? `Uploading ${state.progress}%`
        : cloudLabel(state.state);

  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1", failed ? "border-error/40 text-error" : synced ? "border-success/40 text-success" : "border-edge-subtle text-ink-muted")}>
      {failed ? <AlertTriangle className="h-3.5 w-3.5" /> : synced ? <CheckCircle2 className="h-3.5 w-3.5" /> : state.state === "uploading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
      <span className={typography.caption}>{label}</span>
      {state.retryable && (
        <Button variant="ghost" size="sm" leadingIcon={RefreshCw} className="h-6 px-2" onClick={() => cloudDocumentService.retry()}>
          Retry
        </Button>
      )}
    </span>
  );
}

function cloudLabel(state: string): string {
  switch (state) {
    case "validating":
      return "Validating";
    case "checkingDuplicate":
      return "Checking Cloud";
    case "reservingQuota":
      return "Reserving storage";
    case "finalizing":
      return "Saving to Cloud";
    case "retrying":
      return "Retrying";
    default:
      return "Cloud pending";
  }
}
