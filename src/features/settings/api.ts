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
  const settings = { ...request.settings };
  delete settings.pageSelectionMode;
  delete settings.pageSelection;
  return safeInvoke<PrintResponse>("print_pdf", {
    request: { ...request, settings }
  });
}
