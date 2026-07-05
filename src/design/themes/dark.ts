import { palette, type ThemeColors } from "@/design/tokens/colors";

// Dark theme — the application's default and the look shipping today.
// Mirrors the values in src/design/tokens.css (:root). Keep the two in sync.
export const darkTheme: ThemeColors = {
  bgApp: palette.neutral[950],
  surface: palette.neutral[900],
  elevated: palette.neutral[800],
  card: palette.neutral[900],
  sidebar: palette.neutral[925],
  preview: "#1C1C1E",
  textPrimary: palette.neutral[50],
  textSecondary: palette.neutral[200],
  textMuted: palette.neutral[400],
  textDisabled: palette.neutral[500],
  primary: palette.blue[500],
  primaryHover: palette.blue[400],
  primaryActive: palette.blue[600],
  onPrimary: palette.neutral[0],
  success: palette.green[500],
  warning: palette.amber[500],
  error: palette.red[500],
  info: palette.sky[500],
  border: palette.neutral[700],
  borderSubtle: "rgba(255,255,255,0.08)",
  borderStrong: palette.neutral[600]
};
