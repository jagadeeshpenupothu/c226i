import type { PrinterCapabilities } from "./types";
import type { Printer } from "./printerTypes";

export interface PrinterStoreState {
  printers: Printer[];
  selectedId: string | null;
  capabilities: Record<string, PrinterCapabilities>;
  discovering: boolean;
  capabilitiesLoadingId: string | null;
  error: string | null;
}

// The single source of truth for the printer domain. Observable for React via
// useSyncExternalStore. Only the PrinterManager mutates it.
class PrinterStore {
  private state: PrinterStoreState = {
    printers: [],
    selectedId: null,
    capabilities: {},
    discovering: false,
    capabilitiesLoadingId: null,
    error: null
  };
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): PrinterStoreState => this.state;

  // Stable-reference selectors for useSyncExternalStore.
  readonly getPrinters = (): Printer[] => this.state.printers;
  readonly getSelectedId = (): string | null => this.state.selectedId;
  getCapabilities(id: string | null): PrinterCapabilities | null {
    return id ? this.state.capabilities[id] ?? null : null;
  }

  private patch(next: Partial<PrinterStoreState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }

  setPrinters(printers: Printer[]): void {
    this.patch({ printers });
  }
  setSelected(selectedId: string | null): void {
    if (this.state.selectedId === selectedId) return;
    this.patch({ selectedId });
  }
  setCapabilities(id: string, capabilities: PrinterCapabilities): void {
    this.patch({ capabilities: { ...this.state.capabilities, [id]: capabilities } });
  }
  setDiscovering(discovering: boolean): void {
    this.patch({ discovering });
  }
  setCapabilitiesLoading(capabilitiesLoadingId: string | null): void {
    this.patch({ capabilitiesLoadingId });
  }
  setError(error: string | null): void {
    this.patch({ error });
  }
}

export const printerStore = new PrinterStore();
