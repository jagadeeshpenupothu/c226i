import type { PrinterCapabilities, PrinterInfo, ParsedOption } from "@/features/printers/types";

export interface CommandExecutionRecord {
  label: string;
  program: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitStatus: number | null;
  success: boolean;
  timedOut: boolean;
  durationMs: number;
  error: string | null;
}

export interface HostPrintingEnvironment {
  operatingSystemVersion: string | null;
  cpuArchitecture: string;
  cupsVersion: string | null;
  cupsServerRunning: boolean | null;
  defaultPrinter: string | null;
  installedPrinters: PrinterInfo[];
}

export interface PrinterDiagnosticIdentity {
  cupsDestinationName: string;
  deviceUri: string | null;
  makeModel: string | null;
  driverOrPpd: string | null;
  hostname: string | null;
  ipAddress: string | null;
  printerUuid: string | null;
}

export interface RawCupsData {
  lpstatPrinters: string | null;
  lpstatDevices: string | null;
  lpstatDefault: string | null;
  lpoptionsList: string | null;
  lpoptionsCurrent: string | null;
  lpstatPrinterLong: string | null;
  lpstatAccepting: string | null;
  lpstatQueue: string | null;
  lpstatServer: string | null;
}

export interface QueueJobSnapshot {
  jobId: string;
  owner: string | null;
  sizeBytes: number | null;
  submittedAt: string | null;
  state: string | null;
  name: string | null;
  rawLine: string;
}

export interface QueueSnapshot {
  rawOutput: string;
  jobs: QueueJobSnapshot[];
}

export interface PrinterCapabilitySnapshot {
  rawCapabilities: ParsedOption[];
  normalizedCapabilities: PrinterCapabilities | null;
  unknownDriverOptions: ParsedOption[];
}

export interface PrinterDiagnosticSnapshot {
  schemaVersion: number;
  captureTimestamp: string;
  applicationVersion: string;
  hostEnvironment: HostPrintingEnvironment;
  selectedPrinterIdentity: PrinterDiagnosticIdentity;
  rawCupsData: RawCupsData;
  capabilitySnapshot: PrinterCapabilitySnapshot;
  queueSnapshot: QueueSnapshot;
  commandExecutionRecords: CommandExecutionRecord[];
  warnings: string[];
  errors: string[];
}

export interface DiagnosticExportResponse {
  path: string;
}

