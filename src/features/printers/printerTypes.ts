import type { PrinterCapabilities } from "./types";

// The rich printer domain model. A Printer is a first-class managed entity — not
// a dropdown option. Extensible by design: add fields without touching consumers.

export type PrinterConnectionType = "usb" | "network" | "virtual" | "unknown";

// Combined connectivity + activity state. The current backend only reports
// online/offline/unknown; the remaining states are reserved for Phase 5 polling.
export type PrinterState =
  | "online"
  | "offline"
  | "ready"
  | "busy"
  | "printing"
  | "paused"
  | "sleeping"
  | "warmingUp"
  | "error"
  | "unknown";

export type PrinterHealthState =
  | "ok"
  | "paperJam"
  | "doorOpen"
  | "outOfPaper"
  | "lowPaper"
  | "lowToner"
  | "noToner"
  | "maintenance"
  | "offline"
  | "networkError"
  | "unknown";

export interface PrinterHealth {
  state: PrinterHealthState;
  /** False when the value is a placeholder the backend cannot yet report. */
  reported: boolean;
  message?: string;
}

// Boolean/count rollup of a printer's capabilities for quick UI adaptation.
export interface PrinterCapabilitySummary {
  color: boolean;
  duplex: boolean;
  paperSizes: number;
  trays: number;
  resolutions: number;
  booklet: boolean;
  stapling: boolean;
  holePunch: boolean;
  borderless: boolean;
}

// A single consumable (toner/ink/paper/waste). `level` is null when the backend
// cannot report a percentage — the UI shows "Not Available" rather than guessing.
export interface PrinterConsumable {
  id: string;
  label: string;
  kind: "toner" | "ink" | "paper" | "waste";
  color?: "black" | "cyan" | "magenta" | "yellow";
  level: number | null;
}

// Transport/addressing details. All optional — populated only when the backend
// can report them (IPP/SNMP, Phase 5+ backend work).
export interface PrinterConnection {
  type: PrinterConnectionType;
  hostname?: string;
  ipAddress?: string;
  deviceUri?: string;
  protocol?: string;
}

export interface Printer {
  id: string;
  name: string;
  isDefault: boolean;
  status: PrinterState;
  statusMessage: string;
  driverName: string;
  connectionType: PrinterConnectionType;
  /** Full capabilities, loaded lazily on selection. */
  capabilities?: PrinterCapabilities;
  capabilitySummary?: PrinterCapabilitySummary;
  health: PrinterHealth;
  /** Consumable levels, when the backend can report them (undefined = unknown). */
  consumables?: PrinterConsumable[];
  /** Extended connection details, when the backend can report them. */
  connection?: PrinterConnection;
  lastUpdated: string;
}
