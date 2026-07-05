// Corner radii. `pill` is fully rounded; use it for chips, toggles, and status dots.
export const radius = {
  sm: "0.375rem", // 6px  — inputs, small controls
  md: "0.5rem", //   8px  — buttons, dropdowns
  lg: "0.75rem", //  12px — cards, panels
  xl: "1rem", //     16px — dialogs, large surfaces
  pill: "9999px"
} as const;

export type RadiusToken = keyof typeof radius;
