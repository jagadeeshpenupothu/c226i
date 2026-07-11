export type PageSelectionMode = "all" | "current" | "custom";

export interface PrintSettings {
  printerId: string;
  paperSize: string;
  paperWeight: string;
  tray: string;
  duplex: string;
  copies: number;
  colorMode: string;
  quality: string;
  pageSelectionMode?: PageSelectionMode;
  pageSelection?: string;
  normalizedPageSelection?: string;
  scaleMode?: "fit" | "actual" | "custom";
  customScalePercent?: number;
  marginMode?: "default" | "none" | "custom";
  customMarginsMm?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  align?: string;
  driverOptions?: Record<string, string>;
}
