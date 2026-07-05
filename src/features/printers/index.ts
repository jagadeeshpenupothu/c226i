// Printer Management System — public API.
//
//   printerManager.discover() / .select(id) / .refresh()  — the only API caller
//   usePrinters() / useSelectedPrinter() / usePrinterCapabilities(id) — reactive reads
//   usePrinterQueue(id) — a view over the Job system (references Job IDs)
//   <PrinterSelector /> / <PrinterDashboard /> — the UI

export { printerManager, type PrinterMonitorState } from "./printerManager";
export { printerStore, type PrinterStoreState } from "./printerStore";
export {
  usePrinters,
  useSelectedPrinter,
  useSelectedPrinterId,
  usePrinter,
  usePrinterCapabilities,
  usePrinterDiscovery,
  usePrinterMonitor,
  type PrinterDiscoveryState
} from "./hooks/usePrinters";
export { usePrinterQueue, computePrinterQueue, type PrinterQueue } from "./printerQueue";

// Real-time monitoring
export { printerEventStore, useRecentPrinterEvents, type PrinterEvent, type PrinterEventType } from "./printerEvents";
export {
  notificationStore,
  notify,
  startNotificationWatchers,
  useNotifications,
  useUnreadNotificationCount,
  type PrinterNotification,
  type NotificationType,
  type NotificationSeverity
} from "./printerNotifications";

export type {
  Printer,
  PrinterState,
  PrinterHealth,
  PrinterHealthState,
  PrinterConnectionType,
  PrinterCapabilitySummary,
  PrinterConsumable,
  PrinterConnection
} from "./printerTypes";

export { PrinterSelector } from "./components/PrinterSelector";
export { PrinterDashboard } from "./components/PrinterDashboard";
export { PrinterStatusBadge } from "./components/PrinterStatusBadge";
export { PrinterCard } from "./components/PrinterCard";
export { PrinterCapabilities } from "./components/PrinterCapabilities";
export { NotificationCenter } from "./components/NotificationCenter";
