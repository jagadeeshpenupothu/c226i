// Print Job Management System — public API.
//
//   jobManager.print(request)  → creates + runs a managed job (single source of truth)
//   useActiveJobCount()        → live count for the header badge
//   useJobs()                  → full job list for the Jobs panel
//   <JobsDialog />             → the jobs UI
export { jobManager } from "./jobManager";
export { jobStore } from "./jobStore";
export { useJobs, useActiveJobCount } from "./useJobs";
export { JobsDialog } from "./components/JobsDialog";
export { JobStatusBadge, JobProgress } from "./components/JobStatusBadge";
export type { PrintJob, PrintJobRequest, JobStatus, JobEvent, JobSettingsSnapshot } from "./jobTypes";
