import { describe, expect, it } from 'vitest';

import {
  keptMode,
  nextPanelMode,
  offeredModes,
  shownMode,
} from '@/features/session/lib/panel-modes';
import type { PanelMode } from '@/features/session/store/agent-panel.store';
import { CAPABILITIES, FEWER_CAPABILITIES } from '../../../../support/engines';

const ALL: readonly PanelMode[] = ['ask', 'acceptEdits', 'readOnly', 'allowAll'];

describe('the modes of the panel — plan 08, B-36; plan 09, D-09; plan 23; plan 28, B-27', () => {
  it('offers exactly the modes the engine announces, in its order — S-81', () => {
    expect(offeredModes(CAPABILITIES)).toEqual(ALL);
    expect(offeredModes({ ...CAPABILITIES, permissionModes: ['readOnly', 'ask'] })).toEqual([
      'readOnly',
      'ask',
    ]);
    expect(offeredModes(FEWER_CAPABILITIES)).toEqual(['ask']);
  });

  it('offers none while the capabilities are not known — S-81', () => {
    expect(offeredModes(null)).toEqual([]);
  });

  it('reads a kept canonical mode as it is — S-82', () => {
    for (const mode of ALL) {
      expect(keptMode(mode)).toBe(mode);
    }
  });

  it('reads the names of the previous protocol as the canonical ones they became, once — S-82', () => {
    expect(keptMode('default')).toBe('ask');
    expect(keptMode('plan')).toBe('readOnly');
  });

  it('reads any other value as nothing — the mode the SDK skips the callback in included — S-82', () => {
    expect(keptMode('bypassPermissions')).toBeNull();
    expect(keptMode('allowall')).toBeNull();
    expect(keptMode('constructor')).toBeNull();
    expect(keptMode('')).toBeNull();
    expect(keptMode(null)).toBeNull();
    expect(keptMode(3)).toBeNull();
  });

  it('shows the current mode when offered, the first offered when not, and none with none', () => {
    expect(shownMode(ALL, 'readOnly')).toBe('readOnly');
    expect(shownMode(['acceptEdits', 'ask'], 'readOnly')).toBe('acceptEdits');
    expect(shownMode(ALL, null)).toBe('ask');
    expect(shownMode([], 'ask')).toBeNull();
  });

  it('moves to the next in the order the engine announces, and from the last back to the first', () => {
    expect(nextPanelMode(ALL, 'ask')).toBe('acceptEdits');
    expect(nextPanelMode(ALL, 'acceptEdits')).toBe('readOnly');
    expect(nextPanelMode(ALL, 'readOnly')).toBe('ask');
    expect(nextPanelMode(ALL, null)).toBe('ask');
    expect(nextPanelMode(['readOnly', 'ask'], 'readOnly')).toBe('ask');
  });

  it('never reaches Permitir tudo by the shortcut, and leaves it for the first mode — D-10, S-72', () => {
    const visited = new Set<string>();
    let mode: PanelMode | null = 'ask';

    for (let step = 0; step < ALL.length * 2; step += 1) {
      mode = nextPanelMode(ALL, mode);
      visited.add(String(mode));
    }

    expect(visited.has('allowAll')).toBe(false);
    expect(nextPanelMode(ALL, 'allowAll')).toBe('ask');
  });

  it('has nowhere to move with one mode, with only Permitir tudo besides it, or with none — S-81', () => {
    expect(nextPanelMode(['ask'], 'ask')).toBeNull();
    expect(nextPanelMode(['ask', 'allowAll'], 'ask')).toBeNull();
    expect(nextPanelMode(['ask', 'allowAll'], 'allowAll')).toBe('ask');
    expect(nextPanelMode([], 'ask')).toBeNull();
    expect(nextPanelMode(['allowAll'], 'allowAll')).toBeNull();
  });
});
