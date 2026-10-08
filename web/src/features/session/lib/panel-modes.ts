import type { PanelMode } from '../store/claude-panel.store';

/**
 * The modes the panel offers — Permitir tudo last, and never `bypassPermissions`, which this product
 * never allows (S-170, ADR-022).
 */
export const PANEL_MODES: readonly PanelMode[] = ['default', 'acceptEdits', 'plan', 'allowAll'];

/** The mode a value names — any other is the default, which asks the most. */
export function panelModeOf(current: string | null): PanelMode {
  return PANEL_MODES.find((each) => each === current) ?? 'default';
}

/**
 * Each mode's next, in the order of the menu — and from the last, the first again.
 *
 * Permitir tudo is never a next: a shortcut cycling modes must not switch every question off by
 * accident, so it is only chosen from the menu, with its warning in sight. From it, the shortcut
 * goes back to the mode that asks the most (plan 23, D-10).
 */
const NEXT: Readonly<Record<PanelMode, PanelMode>> = {
  default: 'acceptEdits',
  acceptEdits: 'plan',
  plan: 'default',
  allowAll: 'default',
};

/** The mode after `current` — what "Switch the mode" moves to (D-09). */
export function nextPanelMode(current: string | null): PanelMode {
  return NEXT[panelModeOf(current)];
}
