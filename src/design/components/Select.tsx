import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

// Styled native <select>. IMPORTANT: never wrap this in a <label> — in WebKitGTK
// the label re-fires the click and dismisses the popup instantly. Associate a
// label with `aria-label`/`aria-labelledby` instead.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-8 w-full appearance-none rounded-md border border-edge-subtle bg-app px-3 pr-9 text-sm text-ink outline-none transition duration-fast ease-standard hover:border-edge focus:border-brand focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...rest}
      >
        {children}
      </select>
      <Icon icon={ChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
    </div>
  );
});
