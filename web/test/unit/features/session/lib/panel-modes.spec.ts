import { describe, expect, it } from 'vitest';

import { nextPanelMode, PANEL_MODES, panelModeOf } from '@/features/session/lib/panel-modes';

describe('the modes of the panel — plan 08, B-36; plan 09, D-09; plan 23', () => {
  it('offers Permitir tudo last, and never the SDK`s mode that skips the callback — S-25, S-69', () => {
    expect(PANEL_MODES).toEqual(['default', 'acceptEdits', 'plan', 'allowAll']);
    expect(PANEL_MODES).not.toContain('bypassPermissions');
  });

  it('reads any other value, or none, as the default, which asks the most — S-73', () => {
    expect(panelModeOf('plan')).toBe('plan');
    expect(panelModeOf('allowAll')).toBe('allowAll');
    expect(panelModeOf('bypassPermissions')).toBe('default');
    expect(panelModeOf('allowall')).toBe('default');
    expect(panelModeOf(null)).toBe('default');
  });

  it('moves to the next in the order of the menu, and from the last back to the first', () => {
    expect(nextPanelMode('default')).toBe('acceptEdits');
    expect(nextPanelMode('acceptEdits')).toBe('plan');
    expect(nextPanelMode('plan')).toBe('default');
    expect(nextPanelMode(null)).toBe('acceptEdits');
  });

  it('never reaches Permitir tudo by the shortcut, and leaves it for the default — D-10, S-72', () => {
    const visited = new Set<string>();
    let mode: string = 'default';

    for (let step = 0; step < PANEL_MODES.length * 2; step += 1) {
      mode = nextPanelMode(mode);
      visited.add(mode);
    }

    expect(visited.has('allowAll')).toBe(false);
    expect(nextPanelMode('allowAll')).toBe('default');
  });
});
