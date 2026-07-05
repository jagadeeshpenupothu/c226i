// Typography scale. Each token is a ready-to-use Tailwind class string so callers
// stay declarative (`<h2 className={typography.headingM}>`). Font families live in
// CSS variables (--pp-font-sans / --pp-font-mono) so a future theme can swap them.

export const fontFamily = {
  sans: "var(--pp-font-sans)",
  mono: "var(--pp-font-mono)"
} as const;

export const typography = {
  display: "text-[34px] font-bold leading-[1.15] tracking-[-0.02em]",
  headingXl: "text-[28px] font-semibold leading-tight tracking-[-0.02em]",
  headingL: "text-2xl font-semibold leading-tight tracking-[-0.01em]",
  headingM: "text-lg font-semibold leading-snug tracking-[-0.01em]",
  headingS: "text-[15px] font-semibold leading-snug",
  body: "text-sm font-normal leading-6",
  bodySmall: "text-[13px] font-normal leading-5",
  caption: "text-xs font-normal leading-4",
  label: "text-[13px] font-medium leading-5",
  labelCaps: "text-xs font-semibold uppercase tracking-wide",
  mono: "font-mono text-[13px] leading-5"
} as const;

export type TypographyToken = keyof typeof typography;
