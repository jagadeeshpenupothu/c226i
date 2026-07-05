import { useMemo } from "react";
import { useJobs, type PrintJob } from "@/features/jobs";

// A printer's queue is a VIEW over the Job Management System, not a copy. It
// references the same PrintJob objects (by printerId) — no job data is duplicated.
const ACTIVE_STATUSES = ["preparing", "sending", "spooling", "printing", "retrying"];
const QUEUED_STATUSES = ["queued", "paused"];
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

export interface PrinterQueue {
  currentJob: PrintJob | null;
  active: PrintJob[];
  queued: PrintJob[];
  recent: PrintJob[];
  /** Jobs still in flight (active + queued). */
  pending: number;
}

export function computePrinterQueue(jobs: PrintJob[], printerId: string | null): PrinterQueue {
  const forPrinter = printerId ? jobs.filter((job) => job.printerId === printerId) : [];
  const active = forPrinter.filter((job) => ACTIVE_STATUSES.includes(job.status));
  const queued = forPrinter.filter((job) => QUEUED_STATUSES.includes(job.status));
  const recent = forPrinter.filter((job) => TERMINAL_STATUSES.includes(job.status)).slice(0, 5);
  return { currentJob: active[0] || null, active, queued, recent, pending: active.length + queued.length };
}

export function usePrinterQueue(printerId: string | null): PrinterQueue {
  const jobs = useJobs();
  return useMemo(() => computePrinterQueue(jobs, printerId), [jobs, printerId]);
}
