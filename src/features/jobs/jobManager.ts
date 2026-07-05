import { submitPrintJob } from "@/features/settings/api";
import { createEvent } from "./jobEvents";
import { jobStore } from "./jobStore";
import type { JobStatus, PrintJob, PrintJobRequest } from "./jobTypes";

let jobSequence = 0;
function newJobId(): string {
  jobSequence += 1;
  return `job-${Date.now().toString(36)}-${jobSequence}`;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The JobManager owns the print lifecycle and is the ONLY thing that talks to the
// backend. No print may bypass it. It drives each job through the state machine,
// records timeline events, and reports progress — while the actual submission to
// the OS spooler (submitPrintJob) is left exactly as it was.
//
// NOTE: the OS spooler does not stream per-page progress back to us, so the
// Spooling→Printing→Completed progression after a successful submit is an
// estimate presented for UX. Real per-page tracking (polling lpstat) is a future
// enhancement — the model already carries printedPages/progress for it.
class JobManager {
  createJob(request: PrintJobRequest): PrintJob {
    const now = new Date().toISOString();
    return {
      id: newJobId(),
      documentName: request.documentName,
      documentPath: request.documentPath,
      printerId: request.printerId,
      printerName: request.printerName,
      createdAt: now,
      status: "queued",
      progress: 0,
      totalPages: Math.max(1, request.totalPages || 1),
      printedPages: 0,
      copies: request.settings.copies || 1,
      settings: {
        copies: request.settings.copies || 1,
        paperSize: request.paperSize,
        tray: request.settings.tray,
        colorMode: request.settings.colorMode,
        duplex: request.settings.duplex,
        quality: request.settings.quality,
        orientation: request.orientation
      },
      retryCount: 0,
      events: [createEvent("queued", "Job created")]
    };
  }

  // Creates a job and runs it to a terminal state. Resolves with the final job.
  async print(request: PrintJobRequest): Promise<PrintJob> {
    const job = this.createJob(request);
    jobStore.upsert(job);
    return this.run(job, request);
  }

  private transition(job: PrintJob, status: JobStatus, message: string, changes: Partial<PrintJob> = {}): PrintJob {
    const next: PrintJob = {
      ...job,
      ...changes,
      status,
      events: [...job.events, createEvent(status, message)]
    };
    jobStore.upsert(next);
    return next;
  }

  private async run(initial: PrintJob, request: PrintJobRequest): Promise<PrintJob> {
    let job = this.transition(initial, "preparing", "Preparing document", {
      startedAt: new Date().toISOString(),
      progress: 5
    });
    await delay(300);

    job = this.transition(job, "sending", "Sending to printer", { progress: 15 });

    try {
      // The real, unchanged submission to the OS print system.
      const response = await submitPrintJob({ pdfPath: request.documentPath, settings: request.settings });

      job = this.transition(job, "spooling", `Spooling${response.jobId ? ` (spooler job ${response.jobId})` : ""}`, {
        progress: 35,
        backendJobId: response.jobId,
        message: response.message
      });
      await delay(500);

      job = this.transition(job, "printing", "Printing", { progress: 45 });
      job = await this.progressThroughPages(job);

      return this.transition(job, "completed", response.message || "Completed", {
        progress: 100,
        printedPages: job.totalPages,
        endedAt: new Date().toISOString()
      });
    } catch (error) {
      return this.transition(job, "failed", String(error), {
        errorMessage: String(error),
        endedAt: new Date().toISOString()
      });
    }
  }

  // Estimated page-by-page progress during the Printing phase (see class note).
  private async progressThroughPages(job: PrintJob): Promise<PrintJob> {
    let current = job;
    const total = current.totalPages;
    const step = Math.min(350, Math.max(120, Math.round(1200 / total)));
    for (let page = 1; page <= total; page += 1) {
      await delay(step);
      current = { ...current, printedPages: page, progress: 45 + Math.round((page / total) * 54) };
      jobStore.upsert(current);
    }
    return current;
  }
}

export const jobManager = new JobManager();
