import { AlertTriangle, Ban, CheckCircle2, Clock, Layers, Loader2, Pause, Printer, RotateCw, Send, type LucideIcon } from "lucide-react";
import type { BadgeTone } from "@/design";
import type { JobStatus } from "./jobTypes";

// The ordered happy-path pipeline. Terminal + future states live outside it.
export const JOB_LIFECYCLE: JobStatus[] = ["queued", "preparing", "sending", "spooling", "printing", "completed"];

const TERMINAL: JobStatus[] = ["completed", "cancelled", "failed"];

interface StatusMeta {
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
  /** Icons for in-flight states spin. */
  spin?: boolean;
}

const META: Record<JobStatus, StatusMeta> = {
  queued: { label: "Queued", tone: "neutral", icon: Clock },
  preparing: { label: "Preparing", tone: "info", icon: Loader2, spin: true },
  sending: { label: "Sending", tone: "info", icon: Send },
  spooling: { label: "Spooling", tone: "info", icon: Layers },
  printing: { label: "Printing", tone: "brand", icon: Printer },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
  failed: { label: "Failed", tone: "error", icon: AlertTriangle },
  paused: { label: "Paused", tone: "warning", icon: Pause },
  retrying: { label: "Retrying", tone: "warning", icon: RotateCw, spin: true }
};

export function statusLabel(status: JobStatus): string {
  return META[status].label;
}
export function statusTone(status: JobStatus): BadgeTone {
  return META[status].tone;
}
export function statusIcon(status: JobStatus): LucideIcon {
  return META[status].icon;
}
export function statusSpins(status: JobStatus): boolean {
  return Boolean(META[status].spin);
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.includes(status);
}
export function isActive(status: JobStatus): boolean {
  return !isTerminal(status);
}

// --- Reserved for future actions (Retry / Cancel are NOT implemented in Phase 3;
// these predicates describe when they will become available). ---
export function canCancel(status: JobStatus): boolean {
  return isActive(status);
}
export function canRetry(status: JobStatus): boolean {
  return status === "failed" || status === "cancelled";
}
