import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { IconButton, typography } from "@/design";
import { cn } from "@/lib/utils";
import { useJobs } from "../useJobs";
import { JobDetails } from "./JobDetails";
import { JobsPanel } from "./JobsPanel";

// Master-detail modal: grouped job list on the left, live details on the right.
// Subscribes to the job store, so it updates in real time while a job runs.
export function JobsDialog({ onClose, initialJobId = null }: { onClose: () => void; initialJobId?: string | null }) {
  const jobs = useJobs();
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId);

  // Keep a valid selection: default to the newest job; drop it if it disappears.
  useEffect(() => {
    if (jobs.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => (current && jobs.some((job) => job.id === current) ? current : jobs[0].id));
  }, [jobs]);

  const selected = jobs.find((job) => job.id === selectedId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" role="dialog" aria-modal="true" aria-label="Print jobs">
      <div className="flex h-[76vh] w-[82vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-edge-subtle bg-elevated shadow-dialog">
        <div className="flex shrink-0 items-center justify-between border-b border-edge-subtle px-5 py-3">
          <div>
            <h2 className={cn(typography.headingM, "text-ink")}>Print Jobs</h2>
            <p className={cn(typography.caption, "mt-0.5 text-ink-muted")}>Track every print from queue to completion.</p>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,320px)_1px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto">
            <JobsPanel jobs={jobs} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="bg-edge-subtle" />
          <div className="min-h-0 overflow-auto">
            {selected ? (
              <JobDetails job={selected} />
            ) : (
              <div className={cn(typography.body, "grid h-full place-items-center px-6 text-center text-ink-muted")}>Select a job to see its details.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
