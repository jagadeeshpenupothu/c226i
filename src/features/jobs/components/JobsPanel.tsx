import { Inbox } from "lucide-react";
import { EmptyState, typography } from "@/design";
import { cn } from "@/lib/utils";
import { isActive } from "../jobStatus";
import { formatClock } from "../jobTimeline";
import type { JobStatus, PrintJob } from "../jobTypes";
import { JobProgress, JobStatusBadge } from "./JobStatusBadge";

const GROUPS: { key: string; title: string; match: (status: JobStatus) => boolean }[] = [
  { key: "active", title: "Active", match: (s) => ["preparing", "sending", "spooling", "printing", "retrying"].includes(s) },
  { key: "queued", title: "Queued", match: (s) => s === "queued" || s === "paused" },
  { key: "completed", title: "Completed", match: (s) => s === "completed" },
  { key: "failed", title: "Failed", match: (s) => s === "failed" || s === "cancelled" }
];

interface JobsPanelProps {
  jobs: PrintJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// The grouped job list (Active / Queued / Completed / Failed).
export function JobsPanel({ jobs, selectedId, onSelect }: JobsPanelProps) {
  if (jobs.length === 0) {
    return <EmptyState icon={Inbox} title="No print jobs yet" description="Every time you print, the job appears here so you can track it from queue to completion." />;
  }

  return (
    <div className="grid gap-4 p-3">
      {GROUPS.map((group) => {
        const groupJobs = jobs.filter((job) => group.match(job.status));
        if (groupJobs.length === 0) return null;
        return (
          <section key={group.key} className="grid gap-1.5">
            <p className={cn(typography.labelCaps, "flex items-center gap-1.5 px-1 text-ink-muted")}>
              {group.title}
              <span className="rounded-pill bg-white/10 px-1.5 text-[10px] text-ink-secondary">{groupJobs.length}</span>
            </p>
            {groupJobs.map((job) => (
              <JobRow key={job.id} job={job} selected={job.id === selectedId} onSelect={onSelect} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function JobRow({ job, selected, onSelect }: { job: PrintJob; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(job.id)}
      className={cn(
        "grid w-full gap-1.5 rounded-lg border px-3 py-2.5 text-left outline-none transition duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-brand",
        selected ? "border-brand bg-brand-soft" : "border-edge-subtle bg-white/[0.02] hover:bg-white/[0.05]"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn(typography.label, "min-w-0 flex-1 truncate text-ink")} title={job.documentName}>
          {job.documentName}
        </span>
        <span className={cn(typography.caption, "shrink-0 text-ink-muted")}>{formatClock(job.createdAt)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={cn(typography.caption, "min-w-0 flex-1 truncate text-ink-muted")}>{job.printerName}</span>
        <JobStatusBadge status={job.status} />
      </div>
      {isActive(job.status) && <JobProgress value={job.progress} />}
    </button>
  );
}
