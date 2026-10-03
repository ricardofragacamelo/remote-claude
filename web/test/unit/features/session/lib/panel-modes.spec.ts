import { describe, expect, it } from 'vitest';

import { nextPanelMode, PANEL_MODES, panelModeOf } from '@/features/session/lib/panel-modes';

describe('the modes of the panel — plan 08, B-36; plan 09, D-09', () => {
  it('offers three, and never the one that skips every question — S-25', () => {
    expect(PANEL_MODES).toEqual(['default', 'acceptEdits', 'plan']);
    expect(PANEL_MODES).not.toContain('bypassPermissions');
  });

  it('reads any other value, or none, as the default, which asks the most', () => {
    expect(panelModeOf('plan')).toBe('plan');
    expect(panelModeOf('bypassPermissions')).toBe('default');
    expect(panelModeOf(null)).toBe('default');
  });

  it('moves to the next in the order of the menu, and from the last back to the first', () => {
    expect(nextPanelMode('default')).toBe('acceptEdits');
    expect(nextPanelMode('acceptEdits')).toBe('plan');
    expect(nextPanelMode('plan')).toBe('default');
    expect(nextPanelMode(null)).toBe('acceptEdits');
  });
});
