import { listPrinters } from "./api";
import { deriveHealth } from "./printerHealth";
import { mapBackendStatus } from "./printerStatus";
import type { Printer, PrinterConnectionType } from "./printerTypes";
import type { PrinterInfo } from "./types";

// The current backend (list_printers) does not expose the device URI / transport,
// so connection type cannot be determined yet. Reported honestly as "unknown"
// rather than guessed — Phase 5 (IPP/SNMP) will populate it.
function inferConnection(): PrinterConnectionType {
  return "unknown";
}

// Maps the backend's PrinterInfo into the rich domain entity. Capabilities and
// summary are attached later, on selection (see PrinterManager).
function toPrinter(info: PrinterInfo, now: string): Printer {
  const status = mapBackendStatus(info.status);
  return {
    id: info.id,
    name: info.name,
    isDefault: info.isDefault,
    status,
    statusMessage: info.statusMessage,
    driverName: "",
    connectionType: inferConnection(),
    health: deriveHealth(status),
    lastUpdated: now
  };
}

// The single discovery entry point. Wraps the unchanged list_printers API.
export async function discoverPrinters(): Promise<Printer[]> {
  const infos = await listPrinters();
  const now = new Date().toISOString();
  return infos.map((info) => toPrinter(info, now));
}
