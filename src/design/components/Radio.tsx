import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  value: T;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}

export function RadioGroup<T extends string>({ value, options, onChange, label, className }: RadioGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-1.5", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className="group inline-flex items-center gap-2 text-sm text-ink outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            <span
              className={cn(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-pill border transition duration-fast ease-standard group-focus-visible:ring-2 group-focus-visible:ring-brand",
                selected ? "border-brand" : "border-edge-strong"
              )}
            >
              {selected && <span className="h-2 w-2 rounded-pill bg-brand" />}
            </span>
            <span className="leading-none">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
