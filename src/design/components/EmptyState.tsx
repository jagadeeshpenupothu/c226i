import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/design/tokens/typography";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

// Centered, friendly "nothing here yet" state with an optional icon and CTA.
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-8 py-12 text-center", className)}>
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-brand ring-1 ring-edge-subtle">
          <Icon icon={icon} size="lg" />
        </div>
      )}
      <h2 className={cn(typography.headingM, "text-ink")}>{title}</h2>
      {description && <p className={cn(typography.body, "mt-1.5 max-w-sm text-ink-muted")}>{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
