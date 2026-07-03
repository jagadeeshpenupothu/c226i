import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export function Select({ label, className, children, ...props }: SelectProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      {label && <span>{label}</span>}
      <span className="relative">
        <select
          className={cn(
            "h-11 w-full appearance-none rounded-lg border border-border bg-[#1C1C1E] px-3 pr-10 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}
