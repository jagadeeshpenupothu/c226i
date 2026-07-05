import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6"
} as const;

export type IconSize = keyof typeof SIZES;

export interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  className?: string;
  /** Provide when the icon conveys meaning on its own; omit for decorative icons. */
  label?: string;
}

// The single, canonical way to render an icon. Standardizes size, stroke weight,
// alignment (shrink-0), and accessibility so icons never render inconsistently.
export function Icon({ icon: Glyph, size = "sm", className, label }: IconProps) {
  return (
    <Glyph
      className={cn("shrink-0", SIZES[size], className)}
      strokeWidth={2}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
