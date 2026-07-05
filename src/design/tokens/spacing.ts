// 8-point spacing system (4px base). These values intentionally line up 1:1 with
// Tailwind's default numeric spacing scale, so `p-4` (16px) === `spacing[16]`.
// Use the Tailwind utilities in JSX; use these constants for inline styles, canvas,
// or any computed layout math where a class name won't do.

export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px"
} as const;

export type SpacingToken = keyof typeof spacing;

/** Numeric pixel value for a spacing token (e.g. `space(4)` -> 16). */
export function space(token: SpacingToken): number {
  return parseInt(spacing[token], 10);
}
