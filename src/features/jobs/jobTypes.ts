import type { PrintSettings } from "@/features/settings/types";

// The lifecycle a print job moves through. The happy path is the ordered
// JOB_LIFECYCLE (see jobStatus.ts); cancelled/failed are terminal alternatives,
// and paused/retrying are reserved for future features (architecture only).
export type JobStatus =
  | "queued"
  | "preparing"
  | "sending"
  | "spooling"
  | "printing"
  | "completed"
  | "cancelled"
  | "failed"
  | "paused"
  | "retrying";

// One entry in a job's ordered event log (the timeline).
export interface JobEvent {
  id: string;
  /** ISO timestamp. */
  at: string;
  status: JobStatus;
  message?: string;
}

// Immutable snapshot of the settings a job was submitted with, so the job detail
// reflects exactly what was printed even if the live settings change afterwards.
export interface JobSettingsSnapshot {
  copies: number;
  paperSize: string;
  tray: string;
  colorMode: string;
  duplex: string;
  quality: string;
  orientation: string;
}

// The central domain object. Everything about a print operation lives here.
// Designed to be extensible — add fields without touching the state machine.
export interface PrintJob {
  id: string;
  documentName: string;
  documentPath: string;
  printerId: string;
  printerName: string;

  createdAt: string;
  startedAt?: string;
  endedAt?: string;

  status: JobStatus;
  /** 0–100. */
  progress: number;
  totalPages: number;
  printedPages: number;
  copies: number;

  settings: JobSettingsSnapshot;

  /** Reserved for a future authenticated user / department. */
  user?: string;

  errorMessage?: string;
  retryCount: number;
  /** The CUPS/OS spooler job id returned by the backend, once known. */
  backendJobId?: string;
  /** Latest human-readable message from the backend. */
  message?: string;

  events: JobEvent[];
}

// What the UI hands the JobManager to start a print. Carries both the data the
// backend needs (path + settings) and the display metadata for the job record.
export interface PrintJobRequest {
  documentName: string;
  documentPath: string;
  printerId: string;
  printerName: string;
  settings: PrintSettings;
  totalPages: number;
  /** Human-readable paper label, e.g. "A4 (210 × 297 mm)". */
  paperSize: string;
  orientation: string;
}
