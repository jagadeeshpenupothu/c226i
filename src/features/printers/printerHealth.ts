import {
  CircleHelp,
  DoorOpen,
  Droplet,
  Droplets,
  FileWarning,
  PowerOff,
  ShieldCheck,
  Wifi,
  Wrench,
  type LucideIcon
} from "lucide-react";
import type { BadgeTone } from "@/design";
import type { PrinterHealth, PrinterHealthState, PrinterState } from "./printerTypes";

interface HealthMeta {
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
  description: string;
}

const META: Record<PrinterHealthState, HealthMeta> = {
  ok: { label: "Healthy", tone: "success", icon: ShieldCheck, description: "No problems reported." },
  paperJam: { label: "Paper Jam", tone: "error", icon: FileWarning, description: "Clear the jammed paper." },
  doorOpen: { label: "Door Open", tone: "warning", icon: DoorOpen, description: "Close the printer door/cover." },
  outOfPaper: { label: "Out of Paper", tone: "error", icon: FileWarning, description: "Load paper to continue." },
  lowPaper: { label: "Low Paper", tone: "warning", icon: FileWarning, description: "Paper is running low." },
  lowToner: { label: "Low Toner", tone: "warning", icon: Droplet, description: "Toner is running low." },
  noToner: { label: "No Toner", tone: "error", icon: Droplets, description: "Replace the toner cartridge." },
  maintenance: { label: "Maintenance", tone: "warning", icon: Wrench, description: "Maintenance is required." },
  offline: { label: "Offline", tone: "neutral", icon: PowerOff, description: "The printer is offline." },
  networkError: { label: "Network Error", tone: "error", icon: Wifi, description: "Could not reach the printer." },
  unknown: { label: "Not Available", tone: "neutral", icon: CircleHelp, description: "Detailed health requires IPP/SNMP polling (Phase 5)." }
};

export function healthLabel(state: PrinterHealthState): string {
  return META[state].label;
}
export function healthTone(state: PrinterHealthState): BadgeTone {
  return META[state].tone;
}
export function healthIcon(state: PrinterHealthState): LucideIcon {
  return META[state].icon;
}
export function healthDescription(state: PrinterHealthState): string {
  return META[state].description;
}

// Honest derivation from what the backend actually tells us. We only assert what
// we truly know (offline); everything else is an unreported placeholder. No data
// is fabricated — real jam/toner/etc. detection arrives with Phase 5 polling.
export function deriveHealth(state: PrinterState): PrinterHealth {
  if (state === "offline") return { state: "offline", reported: true, message: "Printer is offline." };
  if (state === "error") return { state: "unknown", reported: false, message: "The printer reported an error; details require polling." };
  return { state: "unknown", reported: false };
}

// All health states — for a future "supported conditions" view / diagnostics.
export const ALL_HEALTH_STATES: PrinterHealthState[] = [
  "ok",
  "paperJam",
  "doorOpen",
  "outOfPaper",
  "lowPaper",
  "lowToner",
  "noToner",
  "maintenance",
  "offline",
  "networkError",
  "unknown"
];
