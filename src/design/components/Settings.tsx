import type { ReactNode } from "react";
import { Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/design/tokens/typography";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

export interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

// A titled, bordered group of setting rows — the building block of a settings panel.
export function SettingsGroup({ title, children, className }: SettingsGroupProps) {
  return (
    <section className={cn("grid gap-1.5", className)}>
      {title && <p className={cn(typography.labelCaps, "text-ink-muted")}>{title}</p>}
      <div className="overflow-hidden rounded-lg border border-edge-subtle bg-black/10">{children}</div>
    </section>
  );
}

export interface SettingRowProps {
  label: string;
  /** Optional leading icon for the setting. */
  icon?: LucideIcon;
  info?: ReactNode;
  children: ReactNode;
  className?: string;
}

// One label + control row, with an optional leading icon and contextual help.
export function SettingRow({ label, icon, info, children, className }: SettingRowProps) {
  return (
    <div
      className={cn(
        "grid min-h-9 gap-1.5 border-b border-edge-subtle px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(128px,0.85fr)_minmax(0,1.3fr)] sm:items-center",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {icon && <Icon icon={icon} className="text-ink-muted" />}
        <span className={cn(typography.label, "text-ink")}>{label}</span>
        {info && (
          <Tooltip content={info}>
            <button
              type="button"
              aria-label={`About ${label}`}
              className="inline-flex rounded text-ink-muted outline-none transition hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Icon icon={Info} size="xs" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
