export type PrinterStatus = "online" | "offline" | "unknown";

export interface PrinterInfo {
  id: string;
  name: string;
  isDefault: boolean;
  status: PrinterStatus;
  statusMessage: string;
}

export interface CapabilityChoice {
  value: string;
  label: string;
  isDefault: boolean;
}

export interface ParsedOption {
  keyword: string;
  displayName: string;
  choices: CapabilityChoice[];
}

export type CapabilityCategory = "essential" | "common" | "advanced" | "expert" | "unknown";
export type CapabilityControlType = "dropdown" | "toggle" | "slider" | "number" | "text" | "password" | "multiSelect" | "readOnly" | "unknown";
export type CapabilitySource = "lpOptions" | "ppd" | "ipp" | "cups" | "unknown";

export interface DriverCapability {
  id: string;
  option: ParsedOption;
  category: CapabilityCategory;
  controlType: CapabilityControlType;
  source: CapabilitySource;
  priority: number;
  safe: boolean;
  writable: boolean;
  hidden: boolean;
  searchKeywords: string[];
}

export interface PrinterCapabilities {
  printerId: string;
  trays: CapabilityChoice[];
  paperSizes: CapabilityChoice[];
  paperTypes: CapabilityChoice[];
  duplexModes: CapabilityChoice[];
  colorModes: CapabilityChoice[];
  resolutions: CapabilityChoice[];
  driverCapabilities?: DriverCapability[];
}
