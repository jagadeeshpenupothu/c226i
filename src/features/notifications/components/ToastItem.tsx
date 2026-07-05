import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Icon, typography } from "@/design";
import { cn } from "@/lib/utils";
import type { NotificationSeverity, PrinterNotification } from "@/features/printers";
import { toastManager, type Toast } from "../toastManager";

// Severity → icon + accent. Mirrors the Notification Center's mapping so a toast
// and its permanent center entry read identically.
const SEVERITY: Record<NotificationSeverity, { icon: LucideIcon; color: string; accent: string }> = {
  info: { icon: Info, color: "text-info", accent: "bg-info" },
  success: { icon: CircleCheck, color: "text-success", accent: "bg-success" },
  warning: { icon: TriangleAlert, color: "text-warning", accent: "bg-warning" },
  error: { icon: AlertTriangle, color: "text-error", accent: "bg-error" }
};

// Fallback if the browser never fires transitionend (e.g. reduced motion).
const EXIT_FALLBACK_MS = 320;

interface ToastItemProps {
  toast: Toast;
  note: PrinterNotification;
  onOpenJob: (jobId: string) => void;
}

export function ToastItem({ toast, note, onOpenJob }: ToastItemProps) {
  const meta = SEVERITY[note.severity];
  const [entered, setEntered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Enter animation: mount off-screen-right + transparent, then flip on the next
  // frame so the transition runs.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Exit animation safety net — remove even if transitionend doesn't fire.
  useEffect(() => {
    if (!toast.leaving) return;
    const timer = setTimeout(() => toastManager.remove(toast.id), EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [toast.leaving, toast.id]);

  const shown = entered && !toast.leaving;
  const hasJob = Boolean(note.jobId);

  function primaryAction() {
    if (note.jobId) onOpenJob(note.jobId);
    toastManager.dismiss(toast.id);
  }

  return (
    <div
      ref={cardRef}
      // The viewport is the aria-live region; the item stays a plain container to
      // avoid nested live regions double-announcing.
      onPointerEnter={() => toastManager.pause(toast.id)}
      onPointerLeave={() => toastManager.resume(toast.id)}
      onTransitionEnd={(event) => {
        // Only react to the card's own opacity transition finishing while leaving.
        if (toast.leaving && event.target === cardRef.current && event.propertyName === "opacity") {
          toastManager.remove(toast.id);
        }
      }}
      className={cn(
        "pointer-events-auto relative flex w-[360px] max-w-[calc(100vw-2rem)] gap-3 overflow-hidden rounded-lg border border-edge-subtle bg-elevated py-3 pl-4 pr-3 shadow-dialog",
        "transition-all duration-medium ease-standard",
        shown ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"
      )}
    >
      {/* Severity accent rail */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", meta.accent)} />

      <Icon icon={meta.icon} className={cn("mt-0.5 shrink-0", meta.color)} />

      {/* Clickable body: opens the related job, or dismisses if there's none. */}
      <button
        type="button"
        onClick={primaryAction}
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <p className={cn(typography.bodySmall, "font-medium text-ink")}>{note.title}</p>
        <p className={cn(typography.caption, "mt-0.5 text-ink-muted")}>{note.message}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className={cn(typography.caption, "text-ink-disabled")}>{relativeTime(note.at)}</span>
          {hasJob && (
            <span className={cn(typography.caption, "font-medium text-brand")}>View job →</span>
          )}
        </div>
      </button>

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => toastManager.dismiss(toast.id)}
        className="absolute right-1.5 top-1.5 rounded p-1 text-ink-muted opacity-70 outline-none transition hover:bg-white/10 hover:text-ink hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Icon icon={X} size="xs" />
      </button>
    </div>
  );
}

// Toasts live ~5s, so this is almost always "Just now"; the coarse buckets keep
// it sensible if a grouped toast lingers or is paused on hover.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
