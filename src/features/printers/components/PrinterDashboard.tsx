import type { ReactNode } from "react";
import { useState } from "react";
import { ExternalLink, Pause, Play, Printer as PrinterIcon, RefreshCw, X } from "lucide-react";
import { Badge, Button, Divider, EmptyState, Icon, IconButton, typography } from "@/design";
import { cn } from "@/lib/utils";
import { JobStatusBadge, type PrintJob } from "@/features/jobs";
import { healthDescription, healthIcon, healthLabel, healthTone } from "../printerHealth";
import { stateDescription } from "../printerStatus";
import { connectionLabel } from "../printerConnection";
import { usePrinter, usePrinterMonitor } from "../hooks/usePrinters";
import { usePrinterQueue } from "../printerQueue";
import { useRecentPrinterEvents } from "../printerEvents";
import { printerManager } from "../printerManager";
import type { Printer } from "../printerTypes";
import { PrinterCapabilities } from "./PrinterCapabilities";
import { PrinterCard } from "./PrinterCard";
import { PrinterStatusBadge } from "./PrinterStatusBadge";

interface PrinterDashboardProps {
  printerId: string | null;
  capabilitiesLoading?: boolean;
  onClose: () => void;
  onOpenJobs?: () => void;
}

// The per-printer dashboard: everything the app knows about one printer, updating
// live from the monitoring engine.
export function PrinterDashboard({ printerId, capabilitiesLoading = false, onClose, onOpenJobs }: PrinterDashboardProps) {
  const printer = usePrinter(printerId);
  const queue = usePrinterQueue(printerId);
  const events = useRecentPrinterEvents(printerId, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" role="dialog" aria-modal="true" aria-label="Printer dashboard">
      <div className="flex h-[82vh] w-[80vw] max-w-3xl flex-col overflow-hidden rounded-xl border border-edge-subtle bg-elevated shadow-dialog">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-edge-subtle px-5 py-3">
          {printer ? <PrinterCard printer={printer} /> : <h2 className={cn(typography.headingM, "text-ink")}>Printer Dashboard</h2>}
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        {printer && <MonitorBar printerId={printer.id} />}

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {!printer ? (
            <EmptyState icon={PrinterIcon} title="No printer selected" description="Connect and select a printer to see its dashboard." />
          ) : (
            <div className="grid gap-4">
              <StatusHealth printer={printer} />

              <Section title="Connection & Driver">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Field label="Connection" value={connectionLabel(printer.connectionType)} />
                  <Field label="Default printer" value={printer.isDefault ? "Yes" : "No"} />
                  <Field label="Hostname" value={printer.connection?.hostname || "Not Available"} />
                  <Field label="IP address" value={printer.connection?.ipAddress || "Not Available"} />
                  <Field label="Device URI" value={printer.connection?.deviceUri || "Not Available"} />
                  <Field label="Driver" value={printer.driverName || "Not Available"} />
                </dl>
              </Section>

              <Section
                title={`Current Job & Queue${queue.pending ? ` · ${queue.pending} pending` : ""}`}
                action={onOpenJobs ? <LinkButton label="Open Jobs" onClick={onOpenJobs} /> : undefined}
              >
                {queue.currentJob ? (
                  <JobLine job={queue.currentJob} note={`${queue.currentJob.printedPages}/${queue.currentJob.totalPages} pages`} />
                ) : (
                  <p className={cn(typography.caption, "text-ink-muted")}>No active job on this printer.</p>
                )}
                {queue.queued.length > 0 && (
                  <div className="mt-2 grid gap-1.5">
                    <p className={cn(typography.labelCaps, "text-ink-muted")}>Queued ({queue.queued.length})</p>
                    {queue.queued.map((job) => (
                      <JobLine key={job.id} job={job} />
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Capabilities">
                <PrinterCapabilities printer={printer} loading={capabilitiesLoading} />
              </Section>

              <Section title="Consumables">
                {printer.consumables && printer.consumables.length > 0 ? (
                  <div className="grid gap-2">
                    {printer.consumables.map((item) => (
                      <div key={item.id} className="grid gap-1">
                        <div className="flex items-center justify-between">
                          <span className={cn(typography.caption, "text-ink-secondary")}>{item.label}</span>
                          <span className={cn(typography.caption, "text-ink")}>{item.level == null ? "Not Available" : `${item.level}%`}</span>
                        </div>
                        {item.level != null && (
                          <div className="h-1.5 overflow-hidden rounded-pill bg-white/10">
                            <div className="h-full rounded-pill bg-brand" style={{ width: `${Math.max(0, Math.min(100, item.level))}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={cn(typography.caption, "text-ink-muted")}>
                    Toner and paper levels aren't reported by this backend. Live consumable monitoring arrives with IPP/SNMP polling.
                  </p>
                )}
              </Section>

              <Section title="Paper Trays">
                {printer.capabilities?.trays.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {printer.capabilities.trays.map((tray) => (
                      <span key={tray.value} className={cn(typography.caption, "rounded-pill bg-white/[0.06] px-2 py-0.5 text-ink-secondary")}>
                        {tray.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className={cn(typography.caption, "text-ink-muted")}>Select the printer to load its trays.</p>
                )}
              </Section>

              <Section title="Recent Events">
                {events.length > 0 ? (
                  <div className="grid gap-1.5">
                    {events.map((event) => (
                      <div key={event.id} className="flex items-center gap-2">
                        <span className={cn(typography.caption, "shrink-0 font-mono text-ink-muted")}>{clock(event.at)}</span>
                        <span className={cn(typography.bodySmall, "truncate text-ink")}>{event.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={cn(typography.caption, "text-ink-muted")}>No printer events recorded yet.</p>
                )}
              </Section>

              <Section title="Recent Jobs">
                {queue.recent.length > 0 ? (
                  <div className="grid gap-1.5">
                    {queue.recent.map((job) => (
                      <JobLine key={job.id} job={job} note={clock(job.endedAt || job.createdAt)} />
                    ))}
                  </div>
                ) : (
                  <p className={cn(typography.caption, "text-ink-muted")}>No jobs printed on this printer yet.</p>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Live status strip: auto-refresh indicator, last-updated, pause/resume, refresh.
function MonitorBar({ printerId }: { printerId: string }) {
  const monitor = usePrinterMonitor();
  const [refreshing, setRefreshing] = useState(false);
  const live = monitor.isPolling && !monitor.isPaused;

  async function refresh() {
    setRefreshing(true);
    try {
      await printerManager.refreshPrinter(printerId);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-edge-subtle bg-white/[0.02] px-5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative flex h-2 w-2">
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-pill bg-success opacity-60" />}
          <span className={cn("relative h-2 w-2 rounded-pill", live ? "bg-success" : monitor.isPaused ? "bg-warning" : "bg-ink-muted")} />
        </span>
        <span className={cn(typography.caption, "text-ink-secondary")}>
          {live ? `Live · auto-refresh ${Math.round(monitor.intervalMs / 1000)}s` : monitor.isPaused ? "Auto-refresh paused" : "Monitoring off"}
        </span>
        <span className={cn(typography.caption, "truncate text-ink-muted")}>· Updated {clock(monitor.lastTickAt || "")}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {monitor.isPolling &&
          (monitor.isPaused ? (
            <Button variant="ghost" size="sm" leadingIcon={Play} onClick={() => printerManager.resumePolling()}>
              Resume
            </Button>
          ) : (
            <Button variant="ghost" size="sm" leadingIcon={Pause} onClick={() => printerManager.pausePolling()}>
              Pause
            </Button>
          ))}
        <Button variant="secondary" size="sm" leadingIcon={RefreshCw} loading={refreshing} onClick={refresh}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

function StatusHealth({ printer }: { printer: Printer }) {
  const health = printer.health;
  return (
    <Section title="Status & Health">
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <PrinterStatusBadge status={printer.status} />
          <span className={cn(typography.caption, "text-ink-muted")}>{printer.statusMessage || stateDescription(printer.status)}</span>
        </div>
        <Divider />
        <div className="flex items-start gap-2">
          <Badge tone={healthTone(health.state)}>
            <Icon icon={healthIcon(health.state)} size="xs" className="mr-1" />
            {healthLabel(health.state)}
          </Badge>
          <span className={cn(typography.caption, "text-ink-muted")}>{health.message || healthDescription(health.state)}</span>
        </div>
      </div>
    </Section>
  );
}

function JobLine({ job, note }: { job: PrintJob; note?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(typography.bodySmall, "min-w-0 flex-1 truncate text-ink")} title={job.documentName}>
        {job.documentName}
      </span>
      {note && <span className={cn(typography.caption, "shrink-0 text-ink-muted")}>{note}</span>}
      <JobStatusBadge status={job.status} />
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className={cn(typography.labelCaps, "text-ink-muted")}>{title}</p>
        {action}
      </div>
      <div className="rounded-lg border border-edge-subtle bg-white/[0.02] p-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className={cn(typography.caption, "text-ink-muted")}>{label}</dt>
      <dd className={cn(typography.caption, "truncate text-ink")} title={value}>
        {value}
      </dd>
    </div>
  );
}

function LinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(typography.caption, "inline-flex items-center gap-1 rounded text-brand outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-brand")}
    >
      {label}
      <Icon icon={ExternalLink} size="xs" />
    </button>
  );
}

function clock(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}
