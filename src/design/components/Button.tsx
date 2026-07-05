import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium outline-none transition duration-medium ease-standard focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg shadow-e-sm hover:bg-brand-hover active:bg-brand-active",
  secondary: "border border-edge-subtle bg-elevated text-ink hover:bg-white/10 active:bg-white/[0.06]",
  ghost: "bg-transparent text-ink-secondary hover:bg-white/10 hover:text-ink",
  outline: "border border-edge text-ink hover:bg-white/5",
  danger: "bg-error text-white shadow-e-sm hover:brightness-110"
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", leadingIcon, trailingIcon, loading = false, className, children, disabled, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {loading ? <Icon icon={Loader2} className="animate-spin" /> : leadingIcon && <Icon icon={leadingIcon} />}
      {children}
      {trailingIcon && !loading && <Icon icon={trailingIcon} />}
    </button>
  );
});

// Convenience wrappers matching the design-system component names.
export const PrimaryButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "variant">>(function PrimaryButton(props, ref) {
  return <Button ref={ref} variant="primary" {...props} />;
});
export const SecondaryButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "variant">>(function SecondaryButton(props, ref) {
  return <Button ref={ref} variant="secondary" {...props} />;
});
export const GhostButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "variant">>(function GhostButton(props, ref) {
  return <Button ref={ref} variant="ghost" {...props} />;
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Required — every icon-only control needs an accessible name. */
  label: string;
  variant?: "ghost" | "secondary";
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "ghost", size = "md", className, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md outline-none transition duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        variant === "secondary" ? "border border-edge-subtle bg-elevated text-ink hover:bg-white/10" : "text-ink-secondary hover:bg-white/10 hover:text-ink",
        className
      )}
      {...rest}
    >
      <Icon icon={icon} />
    </button>
  );
});
