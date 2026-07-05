import { Badge, Icon, typography } from "@/design";
import { cn } from "@/lib/utils";
import { connectionIcon, connectionLabel } from "../printerConnection";
import type { Printer } from "../printerTypes";
import { PrinterStatusBadge } from "./PrinterStatusBadge";

// Compact identity + status summary for one printer. Used in the selector list
// and the dashboard header.
export function PrinterCard({ printer, compact = false }: { printer: Printer; compact?: boolean }) {
  const summary = printer.capabilitySummary;
  const chips = summary
    ? [summary.color ? "Color" : "B&W", summary.duplex && "Duplex", summary.stapling && "Staple", summary.booklet && "Booklet"].filter(Boolean)
    : [];

  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/5 text-ink-muted ring-1 ring-edge-subtle">
        <Icon icon={connectionIcon(printer.connectionType)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(typography.label, "truncate text-ink")} title={printer.name}>
            {printer.name}
          </span>
          {printer.isDefault && <Badge tone="brand">Default</Badge>}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className={cn(typography.caption, "shrink-0 text-ink-muted")}>{connectionLabel(printer.connectionType)}</span>
          {!compact && chips.length > 0 && <span className={cn(typography.caption, "truncate text-ink-muted")}>· {chips.join(" · ")}</span>}
        </div>
      </div>
      <PrinterStatusBadge status={printer.status} />
    </div>
  );
}
