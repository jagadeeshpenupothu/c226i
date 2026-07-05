import { cn } from "@/lib/utils";

export type StatusTone = "online" | "offline" | "busy" | "idle" | "error";

const DOT: Record<StatusTone, string> = {
  online: "bg-success",
  busy: "bg-warning",
  error: "bg-error",
  idle: "bg-info",
  offline: "bg-ink-muted"
};

export interface StatusIndicatorProps {
  tone: StatusTone;
  label?: string;
  /** Animated ping ring — use sparingly for live/active states. */
  pulse?: boolean;
  className?: string;
}

// A colored status dot with an optional label. Communicates device/job state.
export function StatusIndicator({ tone, label, pulse = false, className }: StatusIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-ink-secondary", className)}>
      <span className="relative flex h-2 w-2">
        {pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-pill opacity-60", DOT[tone])} />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-pill", DOT[tone])} />
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}
