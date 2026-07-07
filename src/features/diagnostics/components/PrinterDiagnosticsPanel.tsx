import { useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, RefreshCw, TerminalSquare } from "lucide-react";
import { Button, Divider, Icon, typography } from "@/design";
import { cn } from "@/lib/utils";
import { captureDiagnosticSnapshot, exportDiagnosticSnapshot, type PrinterDiagnosticSnapshot } from "@/features/diagnostics";
import type { Printer } from "@/features/printers";

interface PrinterDiagnosticsPanelProps {
  printer: Printer;
}

export function PrinterDiagnosticsPanel({ printer }: PrinterDiagnosticsPanelProps) {
  const [snapshot, setSnapshot] = useState<PrinterDiagnosticSnapshot | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const normalized = snapshot?.capabilitySnapshot.normalizedCapabilities;
  const commandFailures = useMemo(
    () => snapshot?.commandExecutionRecords.filter((record) => !record.success) || [],
    [snapshot]
  );

  async function capture() {
    setCapturing(true);
    setMessage(null);
    try {
      const next = await captureDiagnosticSnapshot(printer.id);
      setSnapshot(next);
      setMessage("Diagnostic snapshot captured.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setCapturing(false);
    }
  }

  async function exportJson() {
    if (!snapshot) return;
    const path = await save({
      defaultPath: `${printer.name.replace(/[^a-z0-9._-]+/gi, "_")}-diagnostics.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (!path) return;
    setExporting(true);
    setMessage(null);
    try {
      const result = await exportDiagnosticSnapshot(snapshot, path);
      setMessage(`Exported to ${result.path}`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={cn(typography.bodySmall, "text-ink")}>Read-only printer diagnostics</p>
          <p className={cn(typography.caption, "text-ink-muted")}>Captures CUPS environment, driver options, and queue state without submitting jobs.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" leadingIcon={RefreshCw} loading={capturing} onClick={capture}>
            Capture
          </Button>
          <Button variant="ghost" size="sm" leadingIcon={Download} disabled={!snapshot} loading={exporting} onClick={exportJson}>
            Export JSON
          </Button>
        </div>
      </div>

      {message && <p className={cn(typography.caption, "rounded-md bg-white/[0.04] px-2 py-1 text-ink-secondary")}>{message}</p>}

      {snapshot ? (
        <div className="grid gap-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field label="Captured" value={snapshot.captureTimestamp} />
            <Field label="Schema" value={String(snapshot.schemaVersion)} />
            <Field label="macOS" value={snapshot.hostEnvironment.operatingSystemVersion || "Not Available"} />
            <Field label="Architecture" value={snapshot.hostEnvironment.cpuArchitecture} />
            <Field label="CUPS" value={snapshot.hostEnvironment.cupsVersion || "Not Available"} />
            <Field label="Default printer" value={snapshot.hostEnvironment.defaultPrinter || "Not Available"} />
            <Field label="Destination" value={snapshot.selectedPrinterIdentity.cupsDestinationName} />
            <Field label="Make/model" value={snapshot.selectedPrinterIdentity.makeModel || "Not Available"} />
            <Field label="Device URI" value={snapshot.selectedPrinterIdentity.deviceUri || "Not Available"} />
            <Field label="Host" value={snapshot.selectedPrinterIdentity.hostname || "Not Available"} />
          </dl>

          <Divider />

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Count label="Raw options" value={snapshot.capabilitySnapshot.rawCapabilities.length} />
            <Count label="Unknown" value={snapshot.capabilitySnapshot.unknownDriverOptions.length} />
            <Count label="Commands" value={snapshot.commandExecutionRecords.length} />
            <Count label="Queue jobs" value={snapshot.queueSnapshot.jobs.length} />
          </div>

          {normalized && (
            <details className="rounded-md border border-edge-subtle bg-white/[0.02] p-2">
              <summary className={cn(typography.label, "cursor-pointer text-ink")}>Normalized capabilities</summary>
              <CapabilityCounts snapshot={snapshot} />
            </details>
          )}

          <details className="rounded-md border border-edge-subtle bg-white/[0.02] p-2">
            <summary className={cn(typography.label, "cursor-pointer text-ink")}>Raw driver options</summary>
            <div className="mt-2 max-h-52 overflow-auto rounded bg-black/20 p-2">
              {snapshot.capabilitySnapshot.rawCapabilities.map((option) => (
                <p key={option.keyword} className={cn(typography.caption, "font-mono text-ink-secondary")}>
                  {option.keyword} / {option.displayName}: {option.choices.length} choices
                </p>
              ))}
            </div>
          </details>

          <details className="rounded-md border border-edge-subtle bg-white/[0.02] p-2">
            <summary className={cn(typography.label, "cursor-pointer text-ink")}>
              Command execution {commandFailures.length ? `(${commandFailures.length} warnings/errors)` : ""}
            </summary>
            <div className="mt-2 grid max-h-64 gap-2 overflow-auto">
              {snapshot.commandExecutionRecords.map((record) => (
                <div key={`${record.label}-${record.program}-${record.args.join("-")}`} className="rounded bg-black/20 p-2">
                  <p className={cn(typography.caption, "flex items-center gap-1 font-mono text-ink")}>
                    <Icon icon={TerminalSquare} size="xs" />
                    {record.program} {record.args.join(" ")}
                  </p>
                  <p className={cn(typography.caption, record.success ? "text-success" : "text-warning")}>
                    {record.success ? "success" : "failed"} · {record.durationMs} ms · exit {record.exitStatus ?? "n/a"}
                    {record.timedOut ? " · timed out" : ""}
                  </p>
                  {record.stderr && <pre className="mt-1 whitespace-pre-wrap text-[11px] text-warning">{record.stderr}</pre>}
                </div>
              ))}
            </div>
          </details>

          <details className="rounded-md border border-edge-subtle bg-white/[0.02] p-2">
            <summary className={cn(typography.label, "cursor-pointer text-ink")}>Read-only queue snapshot</summary>
            {snapshot.queueSnapshot.jobs.length ? (
              <div className="mt-2 grid gap-1">
                {snapshot.queueSnapshot.jobs.map((job) => (
                  <p key={job.rawLine} className={cn(typography.caption, "font-mono text-ink-secondary")}>{job.rawLine}</p>
                ))}
              </div>
            ) : (
              <p className={cn(typography.caption, "mt-2 text-ink-muted")}>No queued jobs reported.</p>
            )}
          </details>

          {(snapshot.warnings.length > 0 || snapshot.errors.length > 0) && (
            <div className="grid gap-1 rounded-md border border-warning/40 bg-warning-soft p-2">
              {[...snapshot.errors, ...snapshot.warnings].map((item) => (
                <p key={item} className={cn(typography.caption, "text-warning")}>{item}</p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className={cn(typography.caption, "text-ink-muted")}>No diagnostic snapshot captured yet.</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-2">
      <dt className={cn(typography.caption, "shrink-0 text-ink-muted")}>{label}</dt>
      <dd className={cn(typography.caption, "truncate text-ink")} title={value}>{value}</dd>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/[0.04] px-2 py-1.5">
      <p className={cn(typography.caption, "text-ink-muted")}>{label}</p>
      <p className={cn(typography.headingS, "text-ink")}>{value}</p>
    </div>
  );
}

function CapabilityCounts({ snapshot }: { snapshot: PrinterDiagnosticSnapshot }) {
  const caps = snapshot.capabilitySnapshot.normalizedCapabilities;
  if (!caps) return null;
  const rows = [
    ["Paper/media sizes", caps.paperSizes.length],
    ["Trays/input sources", caps.trays.length],
    ["Media types", caps.paperTypes.length],
    ["Duplex modes", caps.duplexModes.length],
    ["Color modes", caps.colorModes.length],
    ["Resolution/quality", caps.resolutions.length],
    ["Driver options", caps.driverCapabilities?.length || 0]
  ];
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <Field key={label} label={String(label)} value={String(value)} />
      ))}
    </dl>
  );
}

