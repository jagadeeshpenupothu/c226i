// Elevation. Values are tuned for dark surfaces; a light theme can override the
// underlying --pp-shadow-* variables. Exposed to Tailwind as `shadow-ds-*`.
export const shadow = {
  sm: "var(--pp-shadow-sm)",
  md: "var(--pp-shadow-md)",
  lg: "var(--pp-shadow-lg)",
  floating: "var(--pp-shadow-floating)",
  dialog: "var(--pp-shadow-dialog)"
} as const;

export type ShadowToken = keyof typeof shadow;
