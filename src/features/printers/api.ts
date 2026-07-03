import { safeInvoke } from "@/lib/tauri";
import type { PrinterCapabilities, PrinterInfo } from "./types";

export function listPrinters() {
  return safeInvoke<PrinterInfo[]>("list_printers");
}

export function getPrinterCapabilities(printerId: string) {
  return safeInvoke<PrinterCapabilities>("get_printer_capabilities", { printerId });
}
