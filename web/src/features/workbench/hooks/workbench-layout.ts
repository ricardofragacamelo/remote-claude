/** How big a resizable part may be, in percent of the space it shares. */
export interface SizeLimit {
  readonly min: number;
  readonly max: number;
  readonly initial: number;
}

/**
 * The limits of each part — so no part can be dragged to nothing, and no part can take the screen.
 * The editor is what is left between the two side bars, and never less than {@link EDITOR_MIN}.
 */
export const LAYOUT_LIMITS = {
  sideBar: { min: 12, max: 40, initial: 20 },
  secondary: { min: 20, max: 50, initial: 32 },
  panel: { min: 15, max: 70, initial: 30 },
} as const satisfies Readonly<Record<string, SizeLimit>>;

/** The least the editor keeps, in percent, however wide the side bars are dragged. */
export const EDITOR_MIN = 25;

/** The sizes of one folder tab's parts. */
export interface WorkbenchLayout {
  readonly sideBar: number;
  readonly secondary: number;
  readonly panel: number;
}

export const INITIAL_LAYOUT: WorkbenchLayout = {
  sideBar: LAYOUT_LIMITS.sideBar.initial,
  secondary: LAYOUT_LIMITS.secondary.initial,
  panel: LAYOUT_LIMITS.panel.initial,
};

function clamp(value: unknown, limit: SizeLimit): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(limit.max, Math.max(limit.min, value))
    : limit.initial;
}

/**
 * A saved layout, as far as it can be trusted.
 *
 * What comes back from storage was written by an older version, by hand, or by nobody: each size is
 * kept only when it is a number, and brought back inside its limits; anything else is the initial
 * size (plan 06, S-113).
 */
export function layoutFrom(saved: unknown): WorkbenchLayout {
  const record =
    typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {};

  return {
    sideBar: clamp(record['sideBar'], LAYOUT_LIMITS.sideBar),
    secondary: clamp(record['secondary'], LAYOUT_LIMITS.secondary),
    panel: clamp(record['panel'], LAYOUT_LIMITS.panel),
  };
}

/**
 * The columns of the workbench, in percent — the side bar, the centre (the editor over the panel) and
 * Claude — with the centre taking what the side bars leave.
 */
export function columnsOf(
  layout: WorkbenchLayout,
  sideBarOpen: boolean,
  secondaryOpen = true,
): Readonly<Record<string, number>> {
  const sideBar = sideBarOpen ? layout.sideBar : 0;
  const secondary = secondaryOpen ? layout.secondary : 0;
  const center = 100 - sideBar - secondary;

  return {
    ...(sideBarOpen ? { sideBar } : {}),
    center,
    ...(secondaryOpen ? { secondary } : {}),
  };
}

/** The rows of the middle column, in percent, when the panel is open. */
export function rowsOf(layout: WorkbenchLayout): Readonly<Record<string, number>> {
  return { editor: 100 - layout.panel, panel: layout.panel };
}
