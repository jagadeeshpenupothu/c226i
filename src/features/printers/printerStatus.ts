import {
  AlertTriangle,
  CircleDot,
  Loader2,
  Moon,
  Pause,
  Power,
  PowerOff,
  Printer,
  ThermometerSun,
  type LucideIcon
} from "lucide-react";
import type { BadgeTone } from "@/design";
import type { PrinterInfo } from "./types";
import type { PrinterState } from "./printerTypes";

interface StateMeta {
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
  description: string;
  spin?: boolean;
}

const META: Record<PrinterState, StateMeta> = {
  online: { label: "Online", tone: "success", icon: Power, description: "Connected and available." },
  ready: { label: "Ready", tone: "success", icon: CircleDot, description: "Idle and ready to accept jobs." },
  busy: { label: "Busy", tone: "brand", icon: Loader2, description: "Processing a job.", spin: true },
  printing: { label: "Printing", tone: "brand", icon: Printer, description: "Currently printing." },
  paused: { label: "Paused", tone: "warning", icon: Pause, description: "The queue is held." },
  sleeping: { label: "Sleeping", tone: "neutral", icon: Moon, description: "In power-save mode." },
  warmingUp: { label: "Warming Up", tone: "warning", icon: ThermometerSun, description: "Preparing to print.", spin: true },
  error: { label: "Error", tone: "error", icon: AlertTriangle, description: "The printer reported an error." },
  offline: { label: "Offline", tone: "neutral", icon: PowerOff, description: "Not reachable." },
  unknown: { label: "Unknown", tone: "neutral", icon: CircleDot, description: "State not reported." }
};

export function stateLabel(state: PrinterState): string {
  return META[state].label;
}
export function stateTone(state: PrinterState): BadgeTone {
  return META[state].tone;
}
export function stateIcon(state: PrinterState): LucideIcon {
  return META[state].icon;
}
export function stateDescription(state: PrinterState): string {
  return META[state].description;
}
export function stateSpins(state: PrinterState): boolean {
  return Boolean(META[state].spin);
}

/** A printer that can currently accept jobs. */
export function isPrintable(state: PrinterState): boolean {
  return state !== "offline" && state !== "error";
}

// The backend reports a narrow online/offline/unknown; widen it into PrinterState.
// Additional states become available once Phase 5 polling lands.
export function mapBackendStatus(status: PrinterInfo["status"]): PrinterState {
  if (status === "online") return "online";
  if (status === "offline") return "offline";
  return "unknown";
}
