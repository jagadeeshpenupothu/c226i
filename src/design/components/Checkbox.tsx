import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

// Single-element checkbox (the box and label live in one button) so a label click
// never double-fires the toggle.
export function Checkbox({ checked, onChange, label, disabled = false, id, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group inline-flex items-center gap-2 text-sm text-ink outline-none disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition duration-fast ease-standard group-focus-visible:ring-2 group-focus-visible:ring-brand",
          checked ? "border-brand bg-brand text-white" : "border-edge-strong bg-transparent"
        )}
      >
        {checked && <Icon icon={Check} size="xs" />}
      </span>
      {label && <span className="leading-none">{label}</span>}
    </button>
  );
}
