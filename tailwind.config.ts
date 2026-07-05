import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- Legacy semantic tokens (unchanged — the app depends on these) ---
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },

        // --- Design-system tokens (additive; backed by --pp-* variables) ------
        app: "var(--pp-color-bg-app)",
        surface: "var(--pp-color-surface)",
        elevated: "var(--pp-color-elevated)",
        sidebar: "var(--pp-color-sidebar)",
        preview: "var(--pp-color-preview)",
        ink: {
          DEFAULT: "var(--pp-color-text-primary)",
          secondary: "var(--pp-color-text-secondary)",
          muted: "var(--pp-color-text-muted)",
          disabled: "var(--pp-color-text-disabled)"
        },
        brand: {
          DEFAULT: "var(--pp-color-primary)",
          hover: "var(--pp-color-primary-hover)",
          active: "var(--pp-color-primary-active)",
          fg: "var(--pp-color-on-primary)",
          soft: "var(--pp-color-primary-soft)"
        },
        success: { DEFAULT: "var(--pp-color-success)", soft: "var(--pp-color-success-soft)" },
        warning: { DEFAULT: "var(--pp-color-warning)", soft: "var(--pp-color-warning-soft)" },
        error: { DEFAULT: "var(--pp-color-error)", soft: "var(--pp-color-error-soft)" },
        info: { DEFAULT: "var(--pp-color-info)", soft: "var(--pp-color-info-soft)" },
        edge: {
          DEFAULT: "var(--pp-color-border)",
          subtle: "var(--pp-color-border-subtle)",
          strong: "var(--pp-color-border-strong)"
        }
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
        xl: "1rem",
        pill: "9999px"
      },
      boxShadow: {
        panel: "0 16px 48px rgba(15, 23, 42, 0.08)",
        "e-sm": "var(--pp-shadow-sm)",
        "e-md": "var(--pp-shadow-md)",
        "e-lg": "var(--pp-shadow-lg)",
        floating: "var(--pp-shadow-floating)",
        dialog: "var(--pp-shadow-dialog)"
      },
      screens: {
        "small-laptop": "1024px",
        laptop: "1280px",
        desktop: "1536px",
        ultrawide: "1920px"
      },
      transitionDuration: {
        fast: "120ms",
        medium: "200ms",
        slow: "320ms"
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        decelerate: "cubic-bezier(0, 0, 0, 1)",
        accelerate: "cubic-bezier(0.3, 0, 1, 1)"
      }
    }
  },
  plugins: [animate]
};

export default config;
