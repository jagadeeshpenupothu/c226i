import { safeInvoke } from "@/lib/tauri";

export interface PresentationBookletRequest {
  pdfPath: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  pinGuideCount: 0 | 1 | 2 | 3 | 4;
  mode?: "presentation" | "normal";
}

export interface PresentationBookletResponse {
  path: string;
  sheetSideCount: number;
  sourcePageCount: number;
}

export function createPresentationBooklet(request: PresentationBookletRequest) {
  return safeInvoke<PresentationBookletResponse>("create_presentation_booklet", { request });
}
