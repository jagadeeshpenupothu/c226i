import { useSyncExternalStore } from "react";
import { jobStore } from "./jobStore";
import type { PrintJob } from "./jobTypes";

// Full job list — re-renders on every job change (use in the Jobs panel/dialog
// that is only mounted when open).
export function useJobs(): PrintJob[] {
  return useSyncExternalStore(jobStore.subscribe, jobStore.getSnapshot, jobStore.getSnapshot);
}

// Active (non-terminal) job count — a primitive, so consumers (e.g. the header
// badge) re-render only when the count changes, not on every progress tick.
export function useActiveJobCount(): number {
  return useSyncExternalStore(jobStore.subscribe, jobStore.getActiveCount, jobStore.getActiveCount);
}
