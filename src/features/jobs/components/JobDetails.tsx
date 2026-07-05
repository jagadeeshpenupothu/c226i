import { Ban, RotateCw } from "lucide-react";
import { Button, Divider, typography, type BadgeTone } from "@/design";
import { cn } from "@/lib/utils";
import { canCancel, canRetry, statusTone } from "../jobStatus";
import { buildTimeline, formatClock, formatDuration, jobDurationMs, lifecycleStages } from "../jobTimeline";
import type { PrintJob } from "../jobTypes";
import { JobProgress, JobStatusBadge } from "./JobStatusBadge";

const TONE_DOT: Record<BadgeTone, string> = {
  neutral: "bg-ink-muted",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info"
};

// The detailed view of a single job: state, progress, metadata, settings, an
// ordered event timeline, and (future) actions.
export function JobDetails({ job }: { job: PrintJob }) {
  const timeline = buildTimeline(job);
  const stages = lifecycleStages(job);

  const meta: { label: string; value: string }[] = [
    { label: "Printer", value: job.printerName },
    { label: "Created", value: formatClock(job.createdAt) },
    { label: "Started", value: job.startedAt ? formatClock(job.startedAt) : "—" },
    { label: "Ended", value: job.endedAt ? formatClock(job.endedAt) : "—" },
    { label: "Duration", value: formatDuration(jobDurationMs(job)) },
    { label: "Spooler Job", value: job.backendJobId || "—" }
  ];

  const settings: { label: string; value: string }[] = [
    { label: "Copies", value: String(job.copies) },
    { label: "Paper Size", value: job.settings.paperSize || "—" },
    { label: "Tray", value: job.settings.tray || "—" },
    { label: "Color", value: job.settings.colorMode || "—" },
    { label: "Duplex", value: job.settings.duplex || "—" },
    { label: "Quality", value: job.settings.quality || "—" },
    { label: "Orientation", value: job.settings.orientation || "—" }
  ];

  return (
    <div className="grid gap-4 p-4">
      {/* Current state + progress */}
      <div className="grid gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={cn(typography.headingS, "truncate text-ink")} title={job.documentName}>
              {job.documentName}
            </h3>
            <p className={cn(typography.caption, "mt-0.5 truncate text-ink-muted")}>{job.documentPath}</p>
          </div>
          <JobStatusBadge status={job.status} />
        </div>
        <JobProgress value={job.progress} />
        <p className={cn(typography.caption, "text-ink-muted")}>
          {job.printedPages} / {job.totalPages} pages · {Math.round(job.progress)}%
        </p>
      </div>

      {job.errorMessage && (
        <div className="rounded-md border border-edge-subtle bg-error-soft px-3 py-2">
          <p className={cn(typography.label, "text-error")}>Error</p>
          <p className={cn(typography.caption, "mt-0.5 text-ink-secondary")}>{job.errorMessage}</p>
        </div>
      )}

      {/* Lifecycle stepper */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {stages.map((stage, index) => (
          <span key={stage.status} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium",
                stage.state === "current" && "bg-brand-soft text-brand",
                stage.state === "done" && "bg-white/[0.06] text-ink-secondary",
                stage.state === "pending" && "text-ink-muted",
                stage.state === "skipped" && "text-ink-disabled line-through"
              )}
            >
              {stage.label}
            </span>
            {index < stages.length - 1 && <span className="text-ink-disabled">›</span>}
          </span>
        ))}
      </div>

      <Metadata title="Details" rows={meta} />
      <Metadata title="Settings" rows={settings} />

      {/* Event timeline */}
      <div className="grid gap-2">
        <p className={cn(typography.labelCaps, "text-ink-muted")}>Timeline</p>
        <ol className="grid gap-0">
          {timeline.map((entry, index) => (
            <li key={entry.id} className="grid grid-cols-[auto_1fr] gap-3">
              <div className="flex flex-col items-center">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-pill", TONE_DOT[statusTone(entry.status)])} />
                {index < timeline.length - 1 && <span className="my-0.5 w-px flex-1 bg-edge-subtle" />}
              </div>
              <div className="pb-3">
                <p className={cn(typography.bodySmall, "text-ink")}>
                  <span className="font-mono text-ink-muted">{entry.clock}</span> · {entry.label}
                </p>
                {entry.message && <p className={cn(typography.caption, "text-ink-muted")}>{entry.message}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Future actions (architecture only — not implemented in Phase 3) */}
      <div>
        <Divider className="mb-3" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leadingIcon={Ban} disabled={!canCancel(job.status)} title="Cancelling jobs is coming in a future update">
            Cancel
          </Button>
          <Button variant="outline" size="sm" leadingIcon={RotateCw} disabled={!canRetry(job.status)} title="Retrying jobs is coming in a future update">
            Retry
          </Button>
          <span className={cn(typography.caption, "text-ink-muted")}>Coming soon</span>
        </div>
      </div>
    </div>
  );
}

function Metadata({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-1.5">
      <p className={cn(typography.labelCaps, "text-ink-muted")}>{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-edge-subtle bg-white/[0.02] p-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2">
            <dt className={cn(typography.caption, "text-ink-muted")}>{row.label}</dt>
            <dd className={cn(typography.caption, "truncate text-ink")} title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
