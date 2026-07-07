import { safeInvoke } from "@/lib/tauri";
import type { DiagnosticExportResponse, PrinterDiagnosticSnapshot } from "./types";

export function captureDiagnosticSnapshot(printerId: string) {
  return safeInvoke<PrinterDiagnosticSnapshot>("capture_diagnostic_snapshot", { printerId });
}

export function exportDiagnosticSnapshot(snapshot: PrinterDiagnosticSnapshot, path: string) {
  return safeInvoke<DiagnosticExportResponse>("export_diagnostic_snapshot", { snapshot, path });
}

