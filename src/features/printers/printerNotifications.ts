import { useSyncExternalStore } from "react";
import { jobStore } from "@/features/jobs";
import type { Printer } from "./printerTypes";

export type NotificationType =
  | "printerOffline"
  | "printerOnline"
  | "paperJam"
  | "outOfPaper"
  | "lowToner"
  | "jobSubmitted"
  | "jobStarted"
  | "jobCompleted"
  | "jobFailed"
  | "info";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface PrinterNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  at: string;
  read: boolean;
  printerId?: string;
  jobId?: string;
}

export type NotificationDraft = Omit<PrinterNotification, "id" | "at" | "read">;

const MAX_NOTIFICATIONS = 50;
let sequence = 0;
function notificationId(): string {
  sequence += 1;
  return `nt-${Date.now().toString(36)}-${sequence}`;
}

// Internal (in-app) notification center. Observable; desktop notifications remain
// an optional future add-on.
class NotificationStore {
  private notifications: PrinterNotification[] = [];
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getSnapshot = (): PrinterNotification[] => this.notifications;
  readonly getUnreadCount = (): number => this.notifications.reduce((total, note) => (note.read ? total : total + 1), 0);

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  add(draft: NotificationDraft): void {
    const note: PrinterNotification = { ...draft, id: notificationId(), at: new Date().toISOString(), read: false };
    this.notifications = [note, ...this.notifications].slice(0, MAX_NOTIFICATIONS);
    this.emit();
  }
  markAllRead(): void {
    if (this.notifications.every((note) => note.read)) return;
    this.notifications = this.notifications.map((note) => (note.read ? note : { ...note, read: true }));
    this.emit();
  }
  dismiss(id: string): void {
    this.notifications = this.notifications.filter((note) => note.id !== id);
    this.emit();
  }
  clear(): void {
    if (this.notifications.length === 0) return;
    this.notifications = [];
    this.emit();
  }
}

export const notificationStore = new NotificationStore();

export function notify(draft: NotificationDraft): void {
  notificationStore.add(draft);
}

// Printer transition → notifications. Only observed transitions notify. Jam /
// out-of-paper / low-toner types exist for when the backend can report them.
export function computePrinterNotifications(previous: Printer | undefined, next: Printer): NotificationDraft[] {
  if (!previous) return [];
  const drafts: NotificationDraft[] = [];

  if (previous.status !== next.status) {
    if (next.status === "offline") {
      drafts.push({ type: "printerOffline", severity: "error", title: "Printer offline", message: `${next.name} went offline.`, printerId: next.id });
    } else if (previous.status === "offline") {
      drafts.push({ type: "printerOnline", severity: "success", title: "Printer back online", message: `${next.name} is available again.`, printerId: next.id });
    }
  }
  if (previous.health.state !== next.health.state) {
    if (next.health.state === "paperJam") drafts.push({ type: "paperJam", severity: "error", title: "Paper jam", message: `${next.name} has a paper jam.`, printerId: next.id });
    else if (next.health.state === "outOfPaper") drafts.push({ type: "outOfPaper", severity: "warning", title: "Out of paper", message: `${next.name} is out of paper.`, printerId: next.id });
    else if (next.health.state === "lowToner") drafts.push({ type: "lowToner", severity: "warning", title: "Low toner", message: `${next.name} is low on toner.`, printerId: next.id });
  }
  return drafts;
}

// --- Job → notification bridge (subscribes to the Job store; does not modify it) -
let watchersStarted = false;
export function startNotificationWatchers(): void {
  if (watchersStarted) return;
  watchersStarted = true;
  // Each lifecycle event fires once per job. Seed with existing jobs so history
  // never re-notifies when the app reloads.
  const submitted = new Set<string>();
  const started = new Set<string>();
  const terminal = new Set<string>();
  for (const job of jobStore.getSnapshot()) {
    submitted.add(job.id);
    if (job.status !== "queued") started.add(job.id);
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") terminal.add(job.id);
  }
  jobStore.subscribe(() => {
    for (const job of jobStore.getSnapshot()) {
      if (!submitted.has(job.id)) {
        submitted.add(job.id);
        notify({ type: "jobSubmitted", severity: "info", title: "Print job submitted", message: `${job.documentName} was queued on ${job.printerName}.`, printerId: job.printerId, jobId: job.id });
      }
      if (job.status === "printing" && !started.has(job.id)) {
        started.add(job.id);
        notify({ type: "jobStarted", severity: "info", title: "Printing started", message: `${job.documentName} is printing on ${job.printerName}.`, printerId: job.printerId, jobId: job.id });
      }
      if (!terminal.has(job.id) && (job.status === "completed" || job.status === "failed" || job.status === "cancelled")) {
        terminal.add(job.id);
        if (job.status === "completed") {
          notify({ type: "jobCompleted", severity: "success", title: "Print complete", message: `${job.documentName} finished on ${job.printerName}.`, printerId: job.printerId, jobId: job.id });
        } else if (job.status === "failed") {
          notify({ type: "jobFailed", severity: "error", title: "Print failed", message: `${job.documentName} failed on ${job.printerName}.`, printerId: job.printerId, jobId: job.id });
        }
      }
    }
  });
}

export function useNotifications(): PrinterNotification[] {
  return useSyncExternalStore(notificationStore.subscribe, notificationStore.getSnapshot, notificationStore.getSnapshot);
}

export function useUnreadNotificationCount(): number {
  return useSyncExternalStore(notificationStore.subscribe, notificationStore.getUnreadCount, notificationStore.getUnreadCount);
}
