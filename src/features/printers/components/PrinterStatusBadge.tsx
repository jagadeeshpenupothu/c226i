import { Badge, Icon } from "@/design";
import { cn } from "@/lib/utils";
import { stateIcon, stateLabel, stateSpins, stateTone } from "../printerStatus";
import type { PrinterState } from "../printerTypes";

// Distinct, tone-colored pill per printer state.
export function PrinterStatusBadge({ status }: { status: PrinterState }) {
  return (
    <Badge tone={stateTone(status)}>
      <Icon icon={stateIcon(status)} size="xs" className={cn("mr-1", stateSpins(status) && "animate-spin")} />
      {stateLabel(status)}
    </Badge>
  );
}
