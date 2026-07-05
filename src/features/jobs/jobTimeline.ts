import { JOB_LIFECYCLE, statusLabel } from "./jobStatus";
import type { JobStatus, PrintJob } from "./jobTypes";

export interface TimelineEntry {
  id: string;
  clock: string;
  label: string;
  status: JobStatus;
  message?: string;
}

// Formats an ISO timestamp as HH:MM:SS for the event timeline.
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

// The ordered event log, ready to render.
export function buildTimeline(job: PrintJob): TimelineEntry[] {
  return job.events.map((event) => ({
    id: event.id,
    clock: formatClock(event.at),
    label: statusLabel(event.status),
    status: event.status,
    message: event.message
  }));
}

export type StageState = "done" | "current" | "pending" | "skipped";

export interface LifecycleStage {
  status: JobStatus;
  label: string;
  state: StageState;
}

// The full happy-path pipeline annotated with each stage's state relative to the
// job's current position — powers the stepped progress view in the detail panel.
export function lifecycleStages(job: PrintJob): LifecycleStage[] {
  const reached = new Set(job.events.map((event) => event.status));
  const failedEarly = job.status === "failed" || job.status === "cancelled";
  const currentIndex = JOB_LIFECYCLE.indexOf(job.status);

  return JOB_LIFECYCLE.map((status, index) => {
    let state: StageState = "pending";
    if (reached.has(status)) state = status === job.status ? "current" : "done";
    else if (job.status === "completed") state = "done";
    else if (failedEarly && currentIndex >= 0 && index > currentIndex) state = "skipped";
    return { status, label: statusLabel(status), state };
  });
}

// Elapsed wall-clock time for a job, in milliseconds (from start, or creation).
export function jobDurationMs(job: PrintJob): number {
  const start = new Date(job.startedAt || job.createdAt).getTime();
  const end = new Date(job.endedAt || new Date().toISOString()).getTime();
  return Math.max(0, end - start);
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
