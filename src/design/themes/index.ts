import { darkTheme } from "./dark";
import { lightTheme } from "./light";
import type { ThemeColors } from "@/design/tokens/colors";

export type ThemeName = "light" | "dark" | "system";

export const themes: Record<"light" | "dark", ThemeColors> = {
  light: lightTheme,
  dark: darkTheme
};

export { darkTheme, lightTheme };

// --- Theme infrastructure (NOT wired to any UI in Phase 1) -------------------
// A future settings toggle can call applyTheme(); today the app always renders
// the dark theme defined on :root, so nothing calls this yet.

const THEME_ATTR = "data-theme";

/** Resolves "system" to a concrete theme using the OS preference. */
export function resolveTheme(name: ThemeName): "light" | "dark" {
  if (name === "system") {
    const prefersLight = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches;
    return prefersLight ? "light" : "dark";
  }
  return name;
}

/** Stamps the resolved theme onto <html> so the CSS variables switch. */
export function applyTheme(name: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(THEME_ATTR, resolveTheme(name));
}
