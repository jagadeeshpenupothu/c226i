import { detectCapabilities, summarizeCapabilities } from "./printerCapabilities";
import { discoverPrinters } from "./printerDiscovery";
import { computePrinterEvents, printerEventStore, type PrinterEventDraft } from "./printerEvents";
import { computePrinterNotifications, notify, type NotificationDraft } from "./printerNotifications";
import { printerStore } from "./printerStore";
import type { Printer } from "./printerTypes";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const MIN_POLL_INTERVAL_MS = 1000;

// Fine-grained change channels — emitted whenever a monitored value changes.
type PrinterChangeEvent = "statusChanged" | "healthChanged" | "capabilitiesChanged";
type PrinterListener = (printer: Printer) => void;

// Reactive monitoring state (separate from the PrinterStore, whose API is frozen).
export interface PrinterMonitorState {
  isPolling: boolean;
  isPaused: boolean;
  intervalMs: number;
  lastTickAt: string | null;
}

// Only the two "identity" changes below cause a store write / re-render. Timestamps
// and preserved capabilities are ignored so steady-state polling is render-free.
function meaningfulEqual(a: Printer, b: Printer): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.isDefault === b.isDefault &&
    a.status === b.status &&
    a.statusMessage === b.statusMessage &&
    a.health.state === b.health.state
  );
}

// The PrinterManager is the ONLY component that talks to the printer APIs and the
// ONLY writer of the PrinterStore. It owns discovery, selection, capability
// detection, the live-status channels, and the polling engine.
class PrinterManager {
  private readonly emitters: Record<PrinterChangeEvent, Set<PrinterListener>> = {
    statusChanged: new Set(),
    healthChanged: new Set(),
    capabilitiesChanged: new Set()
  };

  private monitor: PrinterMonitorState = { isPolling: false, isPaused: false, intervalMs: DEFAULT_POLL_INTERVAL_MS, lastTickAt: null };
  private readonly monitorListeners = new Set<() => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  /** Subscribe to any store data change (list/selection/capabilities/flags). */
  readonly subscribe = printerStore.subscribe;

  // --- Monitoring state (reactive) ---
  readonly subscribeMonitor = (listener: () => void): (() => void) => {
    this.monitorListeners.add(listener);
    return () => this.monitorListeners.delete(listener);
  };
  readonly getMonitor = (): PrinterMonitorState => this.monitor;
  private setMonitor(next: Partial<PrinterMonitorState>): void {
    this.monitor = { ...this.monitor, ...next };
    this.monitorListeners.forEach((listener) => listener());
  }

  private on(event: PrinterChangeEvent, listener: PrinterListener): () => void {
    this.emitters[event].add(listener);
    return () => this.emitters[event].delete(listener);
  }
  private emit(event: PrinterChangeEvent, printer: Printer): void {
    this.emitters[event].forEach((listener) => listener(printer));
  }
  onStatusChanged(listener: PrinterListener) {
    return this.on("statusChanged", listener);
  }
  onHealthChanged(listener: PrinterListener) {
    return this.on("healthChanged", listener);
  }
  onCapabilitiesChanged(listener: PrinterListener) {
    return this.on("capabilitiesChanged", listener);
  }

  // Discovers all printers, diffs against the previous snapshot to generate events
  // and notifications, and writes the store ONLY when something meaningful changed.
  async discover(): Promise<Printer[]> {
    if (this.inFlight) return printerStore.getState().printers; // avoid duplicate concurrent requests
    this.inFlight = true;
    printerStore.setDiscovering(true);
    try {
      const previous = printerStore.getState().printers;
      const discovered = await discoverPrinters();
      const now = new Date().toISOString();

      const merged = discovered.map((incoming) => {
        const prior = previous.find((entry) => entry.id === incoming.id);
        const changed = !prior || !meaningfulEqual(prior, incoming);
        return {
          ...incoming,
          capabilities: prior?.capabilities,
          capabilitySummary: prior?.capabilitySummary,
          consumables: prior?.consumables,
          connection: prior?.connection,
          lastUpdated: changed ? now : prior.lastUpdated
        };
      });

      // Events + notifications from real transitions only.
      const events: PrinterEventDraft[] = [];
      const notifications: NotificationDraft[] = [];
      merged.forEach((next) => {
        const prior = previous.find((entry) => entry.id === next.id);
        events.push(...computePrinterEvents(prior, next));
        notifications.push(...computePrinterNotifications(prior, next));
      });
      previous.forEach((old) => {
        if (!merged.some((entry) => entry.id === old.id)) {
          events.push({ printerId: old.id, printerName: old.name, type: "disconnected", message: "Printer removed" });
          notifications.push({ type: "printerOffline", severity: "error", title: "Printer disconnected", message: `${old.name} was removed.`, printerId: old.id });
        }
      });
      printerEventStore.add(events);
      notifications.forEach((draft) => notify(draft));

      const listChanged =
        merged.length !== previous.length ||
        merged.some((entry) => {
          const prior = previous.find((old) => old.id === entry.id);
          return !prior || !meaningfulEqual(prior, entry);
        });

      if (listChanged) {
        printerStore.setPrinters(merged);
        merged.forEach((next) => {
          const prior = previous.find((entry) => entry.id === next.id);
          if (!prior || prior.status !== next.status) this.emit("statusChanged", next);
          if (!prior || prior.health.state !== next.health.state) this.emit("healthChanged", next);
        });
      }

      printerStore.setError(null);
      this.setMonitor({ lastTickAt: now });
      return listChanged ? merged : previous;
    } catch (error) {
      // Preserve last-known printers during a transient failure (monitoring stays
      // resilient); surface the error rather than wiping the fleet.
      printerStore.setError(String(error));
      this.setMonitor({ lastTickAt: new Date().toISOString() });
      throw error;
    } finally {
      this.inFlight = false;
      printerStore.setDiscovering(false);
    }
  }

  refresh(): Promise<Printer[]> {
    return this.discover();
  }
  refreshAllPrinters(): Promise<Printer[]> {
    return this.discover();
  }
  async refreshPrinter(id: string): Promise<Printer | null> {
    // The backend has no per-printer status endpoint, so this rediscovers all and
    // returns the requested one.
    const list = await this.discover();
    return list.find((printer) => printer.id === id) || null;
  }

  async select(id: string): Promise<void> {
    printerStore.setSelected(id);
    if (id) await this.loadCapabilities(id);
  }

  async loadCapabilities(id: string): Promise<void> {
    if (!id) return;
    if (printerStore.getState().capabilities[id]) {
      this.attachCapabilities(id);
      return;
    }
    printerStore.setCapabilitiesLoading(id);
    try {
      const capabilities = await detectCapabilities(id);
      printerStore.setCapabilities(id, capabilities);
      this.attachCapabilities(id);
    } catch (error) {
      printerStore.setError(String(error));
    } finally {
      if (printerStore.getState().capabilitiesLoadingId === id) printerStore.setCapabilitiesLoading(null);
    }
  }

  private attachCapabilities(id: string): void {
    const state = printerStore.getState();
    const capabilities = state.capabilities[id];
    if (!capabilities) return;
    const summary = summarizeCapabilities(capabilities);
    const printers = state.printers.map((printer) =>
      printer.id === id ? { ...printer, capabilities, capabilitySummary: summary, lastUpdated: new Date().toISOString() } : printer
    );
    printerStore.setPrinters(printers);
    const updated = printers.find((printer) => printer.id === id);
    if (updated) this.emit("capabilitiesChanged", updated);
  }

  getSelected(): Printer | null {
    const state = printerStore.getState();
    return state.printers.find((printer) => printer.id === state.selectedId) || null;
  }

  // --- Polling engine -------------------------------------------------------
  private tick(): void {
    if (this.monitor.isPaused) return;
    void this.discover().catch(() => {}); // errors are captured in the store
  }
  private scheduleTimer(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.tick(), this.monitor.intervalMs);
  }

  startPolling(intervalMs?: number): void {
    if (intervalMs && intervalMs >= MIN_POLL_INTERVAL_MS) this.setMonitor({ intervalMs });
    this.setMonitor({ isPolling: true, isPaused: false });
    void this.discover().catch(() => {});
    this.scheduleTimer();
  }
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.setMonitor({ isPolling: false, isPaused: false });
  }
  pausePolling(): void {
    if (!this.monitor.isPolling || this.monitor.isPaused) return;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.setMonitor({ isPaused: true });
  }
  resumePolling(): void {
    if (!this.monitor.isPolling || !this.monitor.isPaused) return;
    this.setMonitor({ isPaused: false });
    void this.discover().catch(() => {});
    this.scheduleTimer();
  }
  setPollInterval(intervalMs: number): void {
    if (intervalMs < MIN_POLL_INTERVAL_MS) return;
    this.setMonitor({ intervalMs });
    if (this.monitor.isPolling && !this.monitor.isPaused) this.scheduleTimer();
  }
}

export const printerManager = new PrinterManager();
