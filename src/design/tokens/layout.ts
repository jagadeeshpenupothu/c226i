// Centralized layout constants. Numbers are pixels unless noted. Phase 2 (shell
// redesign) should read from here instead of hardcoding widths/heights.
export const layout = {
  sidebarWidth: 260,
  settingsWidth: 380,
  settingsMinWidth: 320,
  toolbarHeight: 56,
  panelGap: 12,
  cardPadding: 16,
  inputHeight: 32,
  controlHeight: 32,
  buttonHeight: 40,
  buttonHeightSm: 32,
  buttonHeightLg: 44,
  scrollbarWidth: 10,
  /** Draggable split range (percent of the workspace given to the preview). */
  splitMinPercent: 58,
  splitMaxPercent: 74,
  splitDefaultPercent: 67
} as const;

export type LayoutToken = keyof typeof layout;
