import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}

// Horizontal single-choice control (a compact radio group). Wraps gracefully in
// narrow columns. Each option is a real radio for accessibility.
export function Segmented<T extends string>({ value, options, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-0.5 rounded-md border border-edge-subtle bg-app p-0.5", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 rounded px-2.5 text-xs font-medium outline-none transition duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-brand",
              selected ? "bg-brand text-brand-fg shadow-e-sm" : "text-ink-secondary hover:bg-white/10 hover:text-ink"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
