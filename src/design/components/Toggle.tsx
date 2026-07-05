import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

// Accessible switch (role="switch"). The label is exposed via aria-label so the
// control stays a single interactive element.
export function Toggle({ checked, onChange, label, disabled = false, id, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill border outline-none transition duration-medium ease-standard focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50",
        checked ? "border-brand bg-brand" : "border-edge-subtle bg-white/10",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-pill bg-white shadow-e-sm transition duration-medium ease-standard",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
