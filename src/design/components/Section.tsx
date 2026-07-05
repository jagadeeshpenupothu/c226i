import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/design/tokens/typography";

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Renders the title in the small uppercase "eyebrow" style used for groups. */
  eyebrow?: boolean;
  className?: string;
}

export function SectionHeader({ title, description, actions, eyebrow = false, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className={cn(typography.labelCaps, "text-ink-muted")}>{title}</p>
        ) : (
          <h3 className={cn(typography.headingS, "text-ink")}>{title}</h3>
        )}
        {description && <p className={cn(typography.caption, "mt-0.5 text-ink-muted")}>{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: boolean;
}

// A titled block. Pairs a SectionHeader with its content at a consistent gap.
export function Section({ title, description, actions, eyebrow, className, children, ...rest }: SectionProps) {
  return (
    <section className={cn("grid gap-2", className)} {...rest}>
      {title && <SectionHeader title={title} description={description} actions={actions} eyebrow={eyebrow} />}
      {children}
    </section>
  );
}
