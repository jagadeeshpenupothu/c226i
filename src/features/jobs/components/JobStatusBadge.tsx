import { Badge, Icon } from "@/design";
import { cn } from "@/lib/utils";
import { statusIcon, statusLabel, statusSpins, statusTone } from "../jobStatus";
import type { JobStatus } from "../jobTypes";

// A distinct, tone-colored pill for each lifecycle state.
export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge tone={statusTone(status)}>
      <Icon icon={statusIcon(status)} size="xs" className={cn("mr-1", statusSpins(status) && "animate-spin")} />
      {statusLabel(status)}
    </Badge>
  );
}

// Slim determinate progress bar (0–100).
export function JobProgress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-pill bg-white/10", className)}
    >
      <div className="h-full rounded-pill bg-brand transition-[width] duration-medium ease-standard" style={{ width: `${clamped}%` }} />
    </div>
  );
}
