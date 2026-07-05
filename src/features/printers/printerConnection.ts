import { Cloud, Network, Usb, Waypoints, type LucideIcon } from "lucide-react";
import type { PrinterConnectionType } from "./printerTypes";

const META: Record<PrinterConnectionType, { label: string; icon: LucideIcon }> = {
  usb: { label: "USB", icon: Usb },
  network: { label: "Network", icon: Network },
  virtual: { label: "Virtual", icon: Cloud },
  unknown: { label: "Connection unknown", icon: Waypoints }
};

export function connectionLabel(type: PrinterConnectionType): string {
  return META[type].label;
}
export function connectionIcon(type: PrinterConnectionType): LucideIcon {
  return META[type].icon;
}
