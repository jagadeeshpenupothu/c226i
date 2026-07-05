import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { IconButton } from "./Button";

// Shared field styling — the single source of truth for text-entry controls.
export const fieldClass =
  "h-8 w-full rounded-md border border-edge-subtle bg-app px-3 text-sm text-ink placeholder:text-ink-muted outline-none transition duration-fast ease-standard hover:border-edge focus:border-brand focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldClass, className)} {...rest} />;
});

export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label: string;
  className?: string;
}

// Numeric stepper with − / + controls and a typable field. No native popup, so it
// behaves reliably inside webviews.
export function NumberInput({ value, onChange, min = 0, max = 999, step = 1, disabled = false, label, className }: NumberInputProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  return (
    <div className={cn("grid grid-cols-[36px_minmax(0,1fr)_36px] gap-2", className)}>
      <IconButton
        icon={Minus}
        label={`Decrease ${label}`}
        variant="secondary"
        size="sm"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}
      />
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        className={cn(fieldClass, "text-center")}
      />
      <IconButton
        icon={Plus}
        label={`Increase ${label}`}
        variant="secondary"
        size="sm"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + step))}
      />
    </div>
  );
}

export interface SearchBoxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, onChange, className, placeholder = "Search", "aria-label": ariaLabel, ...rest }: SearchBoxProps) {
  return (
    <div className={cn("relative", className)}>
      <Icon icon={Search} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={cn(fieldClass, "pl-9")}
        {...rest}
      />
    </div>
  );
}
