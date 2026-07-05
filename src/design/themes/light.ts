import { palette, type ThemeColors } from "@/design/tokens/colors";

// Light theme — prepared infrastructure only. NOT activated in Phase 1.
// Mirrors the values in src/design/tokens.css ([data-theme="light"]).
export const lightTheme: ThemeColors = {
  bgApp: "#F2F3F5",
  surface: "#FFFFFF",
  elevated: "#FFFFFF",
  card: "#FFFFFF",
  sidebar: "#F7F8FA",
  preview: "#E9EAEC",
  textPrimary: "#1A1B1E",
  textSecondary: "#3F4147",
  textMuted: "#6B6D73",
  textDisabled: "#A6A8AE",
  primary: palette.blue[500],
  primaryHover: palette.blue[400],
  primaryActive: palette.blue[600],
  onPrimary: palette.neutral[0],
  success: palette.green[600],
  warning: palette.amber[600],
  error: palette.red[600],
  info: palette.sky[600],
  border: "#D8DADF",
  borderSubtle: "rgba(0,0,0,0.08)",
  borderStrong: "#BFC2C8"
};
