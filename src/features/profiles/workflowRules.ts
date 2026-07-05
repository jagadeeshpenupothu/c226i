import type { Printer } from "@/features/printers";
import type { PrintProfile } from "./profileTypes";

export type WorkflowSuggestionKind = "switchPrinter" | "feature";

export interface WorkflowSuggestion {
  id: string;
  kind: WorkflowSuggestionKind;
  message: string;
  printerId?: string;
  printerName?: string;
}

export interface WorkflowContext {
  profile?: PrintProfile | null;
  printers: Printer[];
  selectedPrinterId: string;
}

function featureLabel(feature: string): string {
  if (feature === "holePunch") return "Hole punching";
  if (feature === "booklet") return "Booklet finishing";
  return "Stapling";
}

// Rules engine — PREPARED only. Returns non-binding suggestions; nothing switches
// automatically (per the phase's constraints). Cross-printer suggestions consider
// only printers whose capabilities have been loaded (capabilitySummary present).
export function evaluateWorkflow(context: WorkflowContext): WorkflowSuggestion[] {
  const { profile, printers, selectedPrinterId } = context;
  const suggestions: WorkflowSuggestion[] = [];
  if (!profile) return suggestions;

  // 1. Profile targets a different, still-available printer.
  if (profile.printerId && profile.printerId !== selectedPrinterId) {
    const target = printers.find((printer) => printer.id === profile.printerId);
    if (target) {
      suggestions.push({
        id: `switch-${target.id}`,
        kind: "switchPrinter",
        message: `This profile was created for ${target.name}.`,
        printerId: target.id,
        printerName: target.name
      });
    }
  }

  // 2. A required finishing feature the current printer lacks but another provides.
  const snapshot = profile.capabilitySnapshot;
  const current = printers.find((printer) => printer.id === selectedPrinterId);
  const currentSummary = current?.capabilitySummary;
  const needs: ("booklet" | "stapling" | "holePunch")[] = [];
  if (snapshot?.booklet) needs.push("booklet");
  if (snapshot?.stapling) needs.push("stapling");
  if (snapshot?.holePunch) needs.push("holePunch");

  for (const feature of needs) {
    if (currentSummary && currentSummary[feature]) continue;
    const candidate = printers.find((printer) => printer.id !== selectedPrinterId && printer.capabilitySummary?.[feature]);
    if (candidate) {
      suggestions.push({
        id: `feature-${feature}-${candidate.id}`,
        kind: "feature",
        message: `${featureLabel(feature)} is available on ${candidate.name}.`,
        printerId: candidate.id,
        printerName: candidate.name
      });
    }
  }

  return suggestions;
}
