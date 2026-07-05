import { isTerminal } from "./jobStatus";
import type { PrintJob } from "./jobTypes";

const STORAGE_KEY = "printpilot.jobs";
const MAX_PERSISTED = 50;

// The single source of truth for print jobs. A tiny observable store designed to
// pair with React's useSyncExternalStore. Terminal jobs are persisted as history;
// in-flight jobs are session-only (so a reload never shows a stuck "Printing").
class JobStore {
  private jobs: PrintJob[];
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.jobs = this.load();
  }

  // Stable reference between mutations — required for useSyncExternalStore.
  readonly getSnapshot = (): PrintJob[] => this.jobs;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // Returns a primitive so subscribers can re-render only when it changes.
  readonly getActiveCount = (): number => this.jobs.reduce((total, job) => (isTerminal(job.status) ? total : total + 1), 0);

  getById(id: string): PrintJob | undefined {
    return this.jobs.find((job) => job.id === id);
  }

  // Inserts a new job at the top or replaces an existing one, then notifies.
  upsert(job: PrintJob): void {
    const exists = this.jobs.some((entry) => entry.id === job.id);
    this.jobs = exists ? this.jobs.map((entry) => (entry.id === job.id ? job : entry)) : [job, ...this.jobs];
    this.persist();
    this.listeners.forEach((listener) => listener());
  }

  private persist(): void {
    try {
      const terminal = this.jobs.filter((job) => isTerminal(job.status)).slice(0, MAX_PERSISTED);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(terminal));
    } catch {
      // Ignore persistence errors (private mode, quota, etc.).
    }
  }

  private load(): PrintJob[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? (parsed as PrintJob[]) : [];
    } catch {
      return [];
    }
  }
}

export const jobStore = new JobStore();
