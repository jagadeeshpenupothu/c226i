import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface AppCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Higher elevation for dialogs / floating surfaces. */
  elevated?: boolean;
  /** Set false to remove default padding (e.g. for edge-to-edge lists). */
  padded?: boolean;
}

// The standard container surface. Consistent radius, border, background, shadow.
export function AppCard({ elevated = false, padded = true, className, children, ...rest }: AppCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-edge-subtle bg-surface",
        elevated ? "shadow-e-lg" : "shadow-e-sm",
        padded && "p-4",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
