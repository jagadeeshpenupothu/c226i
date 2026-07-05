// Responsive breakpoints (min-width, px). Mirrored into tailwind.config `screens`
// so `laptop:` / `desktop:` / `ultrawide:` utilities are available in Phase 2.
// No layouts are changed in Phase 1 — this only prepares the infrastructure.
export const breakpoints = {
  smallLaptop: 1024,
  laptop: 1280,
  desktop: 1536,
  ultrawide: 1920
} as const;

export type BreakpointToken = keyof typeof breakpoints;

export const mediaQuery = {
  smallLaptop: `(min-width: ${breakpoints.smallLaptop}px)`,
  laptop: `(min-width: ${breakpoints.laptop}px)`,
  desktop: `(min-width: ${breakpoints.desktop}px)`,
  ultrawide: `(min-width: ${breakpoints.ultrawide}px)`
} as const;
