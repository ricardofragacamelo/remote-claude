import type { PanelMode } from '../store/claude-panel.store';

/** The modes the panel offers — never `bypassPermissions`, which this product never allows (S-170). */
export const PANEL_MODES: readonly PanelMode[] = ['default', 'acceptEdits', 'plan'];

/** The mode a value names — any other is the default, which asks the most. */
export function panelModeOf(current: string | null): PanelMode {
  return PANEL_MODES.find((each) => each === current) ?? 'default';
}

/** Each mode's next, in the order of the menu — and from the last, the first again. */
const NEXT: Readonly<Record<PanelMode, PanelMode>> = {
  default: 'acceptEdits',
  acceptEdits: 'plan',
  plan: 'default',
};

/** The mode after `current` — what "Switch the mode" moves to (D-09). */
export function nextPanelMode(current: string | null): PanelMode {
  return NEXT[panelModeOf(current)];
}
