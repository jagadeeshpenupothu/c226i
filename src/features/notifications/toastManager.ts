import { notificationStore, type PrinterNotification } from "@/features/printers";

// Toast Notification Manager
// --------------------------
// Toasts are a *transient presentation layer* over the existing Notification
// Center — they never own notification data. The Notification Center store
// remains the single source of truth: each toast only holds a reference
// (`notificationId`) to a center entry plus its own ephemeral UI state (which
// slot it occupies, whether it is animating out). Nothing here duplicates the
// notification's title/message/severity — the viewport reads those live from the
// store by id.
//
// Responsibilities owned here: queue overflow, max-visible cap, grouping,
// auto-dismiss timers (with hover pause/resume), and enter/leave lifecycle.

export interface Toast {
  /** Stable id for this toast instance — distinct from the notification id. */
  id: string;
  /** The Notification Center entry this toast mirrors (the source of truth). */
  notificationId: string;
  /** Related notifications collapse onto one toast (e.g. a job's lifecycle). */
  groupKey: string;
  /** True once dismissed → the viewport plays the exit animation, then removes. */
  leaving: boolean;
}

export const MAX_VISIBLE_TOASTS = 5;
export const AUTO_DISMISS_MS = 5000;

// How related notifications are collapsed. A print job's submitted → started →
// completed events share one toast that updates in place; a flapping printer
// reuses one toast per status change rather than stacking duplicates.
function groupKeyFor(note: PrinterNotification): string {
  if (note.jobId) return `job:${note.jobId}`;
  if (note.printerId) return `printer:${note.printerId}:${note.type}`;
  return `note:${note.id}`;
}

let toastSequence = 0;
function newToastId(): string {
  toastSequence += 1;
  return `toast-${Date.now().toString(36)}-${toastSequence}`;
}

interface TimerRecord {
  handle: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  remaining: number;
}

class ToastManager {
  private visible: Toast[] = []; // index 0 = newest (rendered at the top)
  private queue: string[] = []; // notification ids waiting for a free slot
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Map<string, TimerRecord>();
  private snapshot: Toast[] = [];
  private started = false;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // Stable reference between commits — required by useSyncExternalStore.
  readonly getSnapshot = (): Toast[] => this.snapshot;

  // Begin mirroring the Notification Center. Safe to call more than once.
  start(): void {
    if (this.started) return;
    this.started = true;
    // Existing notifications are history, not fresh events — never toast them.
    for (const note of notificationStore.getSnapshot()) this.seen.add(note.id);
    notificationStore.subscribe(() => this.ingest());
  }

  // Pull any not-yet-seen notifications from the center. Processed oldest→newest
  // so the newest ends up on top of the stack.
  private ingest(): void {
    const notes = notificationStore.getSnapshot(); // newest-first
    for (let i = notes.length - 1; i >= 0; i -= 1) {
      const note = notes[i];
      if (this.seen.has(note.id)) continue;
      this.seen.add(note.id);
      this.present(note);
    }
  }

  private present(note: PrinterNotification): void {
    const groupKey = groupKeyFor(note);
    const existing = this.visible.find((toast) => toast.groupKey === groupKey && !toast.leaving);
    if (existing) {
      // Grouping: the same subject updates its live toast and restarts its timer.
      existing.notificationId = note.id;
      this.startTimer(existing.id);
      this.commit();
      return;
    }
    if (this.visible.length >= MAX_VISIBLE_TOASTS) {
      // Over capacity — queue it. The Notification Center already holds it, so it
      // is never lost; it simply surfaces as a toast once a slot frees.
      this.queue.push(note.id);
      return;
    }
    const toast: Toast = { id: newToastId(), notificationId: note.id, groupKey, leaving: false };
    this.visible = [toast, ...this.visible];
    this.startTimer(toast.id);
    this.commit();
  }

  // Manual close or auto-dismiss: flag the toast so the viewport animates it out.
  dismiss(id: string): void {
    const toast = this.visible.find((entry) => entry.id === id);
    if (!toast || toast.leaving) return;
    toast.leaving = true;
    this.clearTimer(id);
    this.commit();
  }

  // Called by the viewport once the exit animation has finished.
  remove(id: string): void {
    const before = this.visible.length;
    this.visible = this.visible.filter((entry) => entry.id !== id);
    this.clearTimer(id);
    if (this.visible.length !== before) this.promote();
    else this.commit();
  }

  // Pause on hover: freeze the remaining time so the toast stays until the
  // pointer leaves.
  pause(id: string): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === null) return;
    clearTimeout(timer.handle);
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
    timer.handle = null;
  }

  resume(id: string): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== null) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  private promote(): void {
    while (this.queue.length > 0 && this.visible.length < MAX_VISIBLE_TOASTS) {
      const notificationId = this.queue.shift();
      if (!notificationId) break;
      const note = notificationStore.getSnapshot().find((entry) => entry.id === notificationId);
      if (!note) continue; // cleared from the center meanwhile
      const groupKey = groupKeyFor(note);
      const existing = this.visible.find((toast) => toast.groupKey === groupKey && !toast.leaving);
      if (existing) {
        existing.notificationId = note.id;
        this.startTimer(existing.id);
        continue;
      }
      const toast: Toast = { id: newToastId(), notificationId: note.id, groupKey, leaving: false };
      this.visible = [toast, ...this.visible];
      this.startTimer(toast.id);
    }
    this.commit();
  }

  private startTimer(id: string): void {
    this.clearTimer(id);
    this.timers.set(id, {
      handle: setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS),
      startedAt: Date.now(),
      remaining: AUTO_DISMISS_MS
    });
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (!timer) return;
    if (timer.handle !== null) clearTimeout(timer.handle);
    this.timers.delete(id);
  }

  private commit(): void {
    this.snapshot = [...this.visible];
    this.listeners.forEach((listener) => listener());
  }
}

export const toastManager = new ToastManager();
