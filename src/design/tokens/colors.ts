// Color tokens.
//
// Two layers:
//  1. `palette` — primitive, theme-agnostic raw values. Never reference these in
//     components; they exist to compose semantic tokens and themes.
//  2. `color` — semantic accessors that resolve to CSS variables (`--pp-color-*`).
//     The variable VALUES live in `src/design/tokens.css`, themed under `:root`
//     (dark, active today) and `[data-theme="light"]`. Use these in inline styles
//     or JS; in JSX prefer the Tailwind utilities that map to the same variables
//     (e.g. `bg-surface`, `text-secondary`).

export const palette = {
  neutral: {
    0: "#FFFFFF",
    50: "#F4F5F7",
    100: "#E8E8EA",
    200: "#C4C5CA",
    300: "#9A9CA2",
    400: "#8A8C92",
    500: "#6B6D73",
    600: "#48484A",
    700: "#3A3A3C",
    800: "#26272B",
    850: "#1F2023",
    900: "#1C1D20",
    925: "#18191C",
    950: "#101113",
    1000: "#000000"
  },
  blue: { 300: "#5EB0FF", 400: "#2A94FF", 500: "#0A84FF", 600: "#0069D9", 700: "#0053AD" },
  green: { 400: "#4ADE80", 500: "#32D74B", 600: "#28B33F" },
  amber: { 400: "#FFB340", 500: "#FF9F0A", 600: "#D98600" },
  red: { 400: "#FF6B6B", 500: "#FF453A", 600: "#E5372D" },
  sky: { 400: "#7DD3FC", 500: "#64D2FF", 600: "#38BDF8" }
} as const;

export const color = {
  bg: {
    app: "var(--pp-color-bg-app)",
    surface: "var(--pp-color-surface)",
    elevated: "var(--pp-color-elevated)",
    card: "var(--pp-color-card)",
    sidebar: "var(--pp-color-sidebar)",
    preview: "var(--pp-color-preview)"
  },
  text: {
    primary: "var(--pp-color-text-primary)",
    secondary: "var(--pp-color-text-secondary)",
    muted: "var(--pp-color-text-muted)",
    disabled: "var(--pp-color-text-disabled)"
  },
  brand: {
    primary: "var(--pp-color-primary)",
    primaryHover: "var(--pp-color-primary-hover)",
    primaryActive: "var(--pp-color-primary-active)",
    onPrimary: "var(--pp-color-on-primary)"
  },
  feedback: {
    success: "var(--pp-color-success)",
    warning: "var(--pp-color-warning)",
    error: "var(--pp-color-error)",
    info: "var(--pp-color-info)"
  },
  border: {
    default: "var(--pp-color-border)",
    subtle: "var(--pp-color-border-subtle)",
    strong: "var(--pp-color-border-strong)"
  }
} as const;

// Shape shared by every theme — see src/design/themes.
export interface ThemeColors {
  bgApp: string;
  surface: string;
  elevated: string;
  card: string;
  sidebar: string;
  preview: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  onPrimary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  border: string;
  borderSubtle: string;
  borderStrong: string;
}
