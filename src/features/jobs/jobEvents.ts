import type { JobEvent, JobStatus } from "./jobTypes";

let sequence = 0;

// Factory for a timeline event. Timestamps are captured at creation so the
// ordered event log doubles as an audit trail (future: persist / export).
export function createEvent(status: JobStatus, message?: string): JobEvent {
  sequence += 1;
  return {
    id: `evt-${Date.now().toString(36)}-${sequence}`,
    at: new Date().toISOString(),
    status,
    message
  };
}

// Appends an event immutably.
export function appendEvent(events: JobEvent[], status: JobStatus, message?: string): JobEvent[] {
  return [...events, createEvent(status, message)];
}
