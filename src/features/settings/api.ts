import { safeInvoke } from "@/lib/tauri";
import type { PrintSettings } from "./types";

export interface PrintRequest {
  pdfPath: string;
  settings: PrintSettings;
}

export interface PrintResponse {
  jobId: string;
  message: string;
}

export function submitPrintJob(request: PrintRequest) {
  return safeInvoke<PrintResponse>("print_pdf", { request });
}
