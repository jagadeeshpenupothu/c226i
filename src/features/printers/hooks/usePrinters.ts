import { useSyncExternalStore } from "react";
import { printerManager, type PrinterMonitorState } from "../printerManager";
import { printerStore } from "../printerStore";
import type { Printer } from "../printerTypes";
import type { PrinterCapabilities } from "../types";

// Reactive hooks over the PrinterStore. All read-only — mutations go through the
// PrinterManager.

export function usePrinters(): Printer[] {
  return useSyncExternalStore(printerStore.subscribe, printerStore.getPrinters, printerStore.getPrinters);
}

export function useSelectedPrinterId(): string | null {
  return useSyncExternalStore(printerStore.subscribe, printerStore.getSelectedId, printerStore.getSelectedId);
}

export function usePrinter(id: string | null): Printer | null {
  const printers = usePrinters();
  return id ? printers.find((printer) => printer.id === id) || null : null;
}

export function useSelectedPrinter(): Printer | null {
  return usePrinter(useSelectedPrinterId());
}

export function usePrinterCapabilities(id: string | null): PrinterCapabilities | null {
  const getSnapshot = () => printerStore.getCapabilities(id);
  return useSyncExternalStore(printerStore.subscribe, getSnapshot, getSnapshot);
}

export interface PrinterDiscoveryState {
  discovering: boolean;
  capabilitiesLoadingId: string | null;
  error: string | null;
}

export function usePrinterDiscovery(): PrinterDiscoveryState {
  const state = useSyncExternalStore(printerStore.subscribe, printerStore.getState, printerStore.getState);
  return { discovering: state.discovering, capabilitiesLoadingId: state.capabilitiesLoadingId, error: state.error };
}

// Live polling state (isPolling / paused / interval / last tick) for the dashboard.
export function usePrinterMonitor(): PrinterMonitorState {
  return useSyncExternalStore(printerManager.subscribeMonitor, printerManager.getMonitor, printerManager.getMonitor);
}
