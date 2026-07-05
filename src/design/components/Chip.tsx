import type { ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export interface ChipProps {
  children: ReactNode;
  icon?: LucideIcon;
  selected?: boolean;
  onClick?: () => void;
  /** When provided, renders a remove (×) affordance. */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

// Compact, optionally selectable/removable token. Interactive when onClick given.
export function Chip({ children, icon, selected = false, onClick, onRemove, removeLabel = "Remove", className }: ChipProps) {
  const interactive = Boolean(onClick);
  const content = (
    <>
      {icon && <Icon icon={icon} size="xs" />}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 ml-0.5 inline-flex rounded-pill p-0.5 text-ink-muted transition hover:bg-white/10 hover:text-ink"
        >
          <Icon icon={X} size="xs" />
        </button>
      )}
    </>
  );

  const base = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[13px] transition duration-fast ease-standard",
    selected ? "border-brand bg-brand-soft text-brand" : "border-edge-subtle bg-white/[0.04] text-ink-secondary",
    interactive && "outline-none hover:border-edge hover:text-ink focus-visible:ring-2 focus-visible:ring-brand",
    className
  );

  if (interactive) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={base}>
        {content}
      </button>
    );
  }
  return <span className={base}>{content}</span>;
}
