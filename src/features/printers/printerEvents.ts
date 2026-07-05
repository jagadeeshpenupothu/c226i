import { useSyncExternalStore } from "react";
import type { Printer } from "./printerTypes";

export type PrinterEventType =
  | "connected"
  | "disconnected"
  | "started"
  | "sleeping"
  | "wokeUp"
  | "paperLoaded"
  | "paperRemoved"
  | "jamCleared"
  | "doorClosed"
  | "tonerReplaced"
  | "error"
  | "recovered"
  | "statusChanged";

export interface PrinterEvent {
  id: string;
  printerId: string;
  printerName: string;
  type: PrinterEventType;
  at: string;
  message: string;
}

export type PrinterEventDraft = Omit<PrinterEvent, "id" | "at">;

const MAX_EVENTS = 200;
let sequence = 0;
function eventId(): string {
  sequence += 1;
  return `pe-${Date.now().toString(36)}-${sequence}`;
}

// Ordered, capped, timestamped event log for the printer fleet. Observable for
// React. Doubles as an audit trail (future: persist / export / stream).
class PrinterEventStore {
  private events: PrinterEvent[] = [];
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getSnapshot = (): PrinterEvent[] => this.events;

  add(drafts: PrinterEventDraft[]): void {
    if (drafts.length === 0) return;
    const at = new Date().toISOString();
    const stamped = drafts.map((draft) => ({ ...draft, id: eventId(), at }));
    // Newest first.
    this.events = [...stamped.reverse(), ...this.events].slice(0, MAX_EVENTS);
    this.listeners.forEach((listener) => listener());
  }
}

export const printerEventStore = new PrinterEventStore();

// Derives events by comparing a printer's previous and next state. Only real,
// observed transitions produce events — nothing is invented.
export function computePrinterEvents(previous: Printer | undefined, next: Printer): PrinterEventDraft[] {
  const base = { printerId: next.id, printerName: next.name };
  const events: PrinterEventDraft[] = [];

  if (!previous) {
    events.push({ ...base, type: "connected", message: "Printer connected" });
    return events;
  }

  if (previous.status !== next.status) {
    if (next.status === "offline") events.push({ ...base, type: "disconnected", message: "Printer went offline" });
    else if (previous.status === "offline") events.push({ ...base, type: "connected", message: "Printer came back online" });
    else if (next.status === "sleeping") events.push({ ...base, type: "sleeping", message: "Printer is sleeping" });
    else if (previous.status === "sleeping") events.push({ ...base, type: "wokeUp", message: "Printer woke up" });
    else if (next.status === "printing" || next.status === "busy") events.push({ ...base, type: "started", message: "Printer started a job" });
    else if (next.status === "error") events.push({ ...base, type: "error", message: "Printer reported an error" });
    else if (previous.status === "error") events.push({ ...base, type: "recovered", message: "Printer recovered" });
    else events.push({ ...base, type: "statusChanged", message: `Status changed to ${next.status}` });
  }

  if (previous.health.state !== next.health.state) {
    const prev = previous.health.state;
    const now = next.health.state;
    if (prev === "outOfPaper" && now !== "outOfPaper") events.push({ ...base, type: "paperLoaded", message: "Paper loaded" });
    else if (now === "outOfPaper") events.push({ ...base, type: "paperRemoved", message: "Out of paper" });
    else if (prev === "paperJam" && now !== "paperJam") events.push({ ...base, type: "jamCleared", message: "Paper jam cleared" });
    else if (prev === "doorOpen" && now !== "doorOpen") events.push({ ...base, type: "doorClosed", message: "Door closed" });
    else if ((prev === "noToner" || prev === "lowToner") && now === "ok") events.push({ ...base, type: "tonerReplaced", message: "Toner replaced" });
  }

  return events;
}

// Recent events, optionally scoped to one printer.
export function useRecentPrinterEvents(printerId?: string | null, limit = 8): PrinterEvent[] {
  const events = useSyncExternalStore(printerEventStore.subscribe, printerEventStore.getSnapshot, printerEventStore.getSnapshot);
  const scoped = printerId ? events.filter((event) => event.printerId === printerId) : events;
  return scoped.slice(0, limit);
}
