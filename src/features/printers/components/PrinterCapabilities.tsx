import { BookOpen, CircleDot, Frame, Layers, Palette, Paperclip, type LucideIcon } from "lucide-react";
import { Chip, typography } from "@/design";
import { cn } from "@/lib/utils";
import type { Printer } from "../printerTypes";

// Visualizes a printer's detected capabilities. The UI auto-adapts: only
// supported finishing features are shown; unsupported ones simply don't appear.
export function PrinterCapabilities({ printer, loading = false }: { printer: Printer | null; loading?: boolean }) {
  if (loading) {
    return <p className={cn(typography.caption, "text-ink-muted")}>Detecting capabilities…</p>;
  }
  const caps = printer?.capabilities;
  const summary = printer?.capabilitySummary;
  if (!caps || !summary) {
    return <p className={cn(typography.caption, "text-ink-muted")}>Select this printer to detect its capabilities.</p>;
  }

  const features: { on: boolean; label: string; icon: LucideIcon; always?: boolean }[] = [
    { on: summary.color, label: summary.color ? "Color" : "Black & White", icon: Palette, always: true },
    { on: summary.duplex, label: "Duplex", icon: Layers },
    { on: summary.booklet, label: "Booklet", icon: BookOpen },
    { on: summary.stapling, label: "Stapling", icon: Paperclip },
    { on: summary.holePunch, label: "Hole Punch", icon: CircleDot },
    { on: summary.borderless, label: "Borderless", icon: Frame }
  ];
  const shown = features.filter((feature) => feature.always || feature.on);

  const sizes = caps.paperSizes.slice(0, 12);
  const moreSizes = caps.paperSizes.length - sizes.length;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {shown.map((feature) => (
          <Chip key={feature.label} icon={feature.icon} selected={feature.on}>
            {feature.label}
          </Chip>
        ))}
      </div>

      <p className={cn(typography.caption, "text-ink-muted")}>
        {summary.paperSizes} paper sizes · {summary.trays} trays · {summary.resolutions} resolutions
      </p>

      {sizes.length > 0 && (
        <div className="grid gap-1.5">
          <p className={cn(typography.labelCaps, "text-ink-muted")}>Supported Media</p>
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((size) => (
              <Chip key={size.value}>{size.label}</Chip>
            ))}
            {moreSizes > 0 && <Chip>+{moreSizes} more</Chip>}
          </div>
        </div>
      )}
    </div>
  );
}
