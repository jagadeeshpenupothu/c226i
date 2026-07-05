// Motion tokens. Keep transitions purposeful and short — desktop software should
// feel instant, not animated. Durations pair with the standard easing curves.

export const duration = {
  fast: "120ms",
  medium: "200ms",
  slow: "320ms"
} as const;

export const easing = {
  /** General UI movement — the default. */
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  /** Elements entering the screen. */
  decelerate: "cubic-bezier(0, 0, 0, 1)",
  /** Elements leaving the screen. */
  accelerate: "cubic-bezier(0.3, 0, 1, 1)"
} as const;

export type DurationToken = keyof typeof duration;
export type EasingToken = keyof typeof easing;

/** Convenience CSS `transition` value. */
export function transition(properties = "all", token: DurationToken = "medium", curve: EasingToken = "standard") {
  return `${properties} ${duration[token]} ${easing[curve]}`;
}
