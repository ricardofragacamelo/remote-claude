import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  chordOf,
  chordOfEvent,
  onMac,
  reservedIn,
  shortcutLabel,
} from '@/features/commands/hooks/chords';

afterEach(() => {
  vi.restoreAllMocks();
});

function press(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('a chord as it is written', () => {
  it('reads Mod as Ctrl away from a Mac and as Cmd on one', () => {
    expect(chordOf({ key: 'Mod+Shift+P' }, false)).toBe('Ctrl+Shift+P');
    expect(chordOf({ key: 'Mod+Shift+P' }, true)).toBe('Shift+Meta+P');
  });

  it('spells the same chord one way, whatever order it was written in', () => {
    expect(chordOf({ key: 'Shift+Ctrl+p' }, false)).toBe(chordOf({ key: 'ctrl+shift+P' }, false));
  });

  it('uses the Mac spelling on a Mac when there is one', () => {
    const binding = { key: 'Ctrl+Alt+PageDown', mac: 'Mod+Alt+ArrowRight' };

    expect(chordOf(binding, false)).toBe('Ctrl+Alt+PageDown');
    expect(chordOf(binding, true)).toBe('Alt+Meta+ArrowRight');
  });

  it('refuses a chord with no key, and a modifier nobody knows — a typo is seen at load', () => {
    expect(() => chordOf({ key: 'Ctrl+' }, false)).toThrow('names no key');
    expect(() => chordOf({ key: 'Hyper+K' }, false)).toThrow('unknown modifier "Hyper"');
  });
});

describe('the chord a key press is', () => {
  it('names letters and digits by the physical key — Alt+1 on a Mac types ¡', () => {
    expect(chordOfEvent(press({ key: '¡', code: 'Digit1', altKey: true }))).toBe('Alt+1');
    expect(chordOfEvent(press({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true }))).toBe(
      'Ctrl+Shift+P',
    );
  });

  it('names every other key by what it is', () => {
    expect(
      chordOfEvent(press({ key: 'PageDown', code: 'PageDown', ctrlKey: true, altKey: true })),
    ).toBe('Ctrl+Alt+PageDown');
    expect(chordOfEvent(press({ key: 'F1', code: 'F1', shiftKey: true }))).toBe('Shift+F1');
    expect(chordOfEvent(press({ key: 'o', code: '', metaKey: true }))).toBe('Meta+O');
  });
});

describe('the keys the browser keeps — plan 06, D-16', () => {
  it.each([
    'Ctrl+Tab',
    'Ctrl+Shift+Tab',
    'Ctrl+W',
    'Ctrl+T',
    'Ctrl+N',
    'Ctrl+PageUp',
    'Ctrl+PageDown',
  ])('knows %s is kept away from a Mac', (key) => {
    expect(reservedIn({ key })).toBe('other');
  });

  it.each(['Mod+W', 'Mod+T', 'Mod+N'])('knows %s is kept on a Mac too', (key) => {
    expect(reservedIn({ key, mac: key })).not.toBeNull();
    expect(reservedIn({ key: 'Alt+9', mac: key })).toBe('mac');
  });

  it.each(['Alt+1', 'Ctrl+Alt+PageDown', 'Mod+Shift+P', 'Mod+O', 'F1'])(
    'lets %s through',
    (key) => {
      expect(reservedIn({ key })).toBeNull();
    },
  );
});

describe('a shortcut, written for a person', () => {
  it('is words away from a Mac, and says the same to a screen reader', () => {
    expect(shortcutLabel({ key: 'Mod+Shift+P' }, false)).toEqual({
      label: 'Ctrl+Shift+P',
      aria: 'Control+Shift+P',
    });
  });

  it("is the Mac's own symbols on a Mac", () => {
    expect(shortcutLabel({ key: 'Mod+Shift+P' }, true)).toEqual({
      label: '⇧⌘P',
      aria: 'Shift+Meta+P',
    });
    expect(shortcutLabel({ key: 'Mod+O' }, true)).toEqual({ label: '⌘O', aria: 'Meta+O' });
  });

  it('draws the arrows, and names them in full for a screen reader', () => {
    expect(shortcutLabel({ key: 'X', mac: 'Mod+Alt+ArrowLeft' }, true)).toEqual({
      label: '⌥⌘←',
      aria: 'Alt+Meta+ArrowLeft',
    });
    expect(shortcutLabel({ key: 'Ctrl+Meta+ArrowRight' }, false)).toEqual({
      label: 'Ctrl+Meta+→',
      aria: 'Control+Meta+ArrowRight',
    });
  });
});

describe('the platform', () => {
  it('is a Mac on a Mac, an iPhone and an iPad, and nothing else is', () => {
    const platform = vi.spyOn(navigator, 'platform', 'get');

    platform.mockReturnValue('MacIntel');
    expect(onMac()).toBe(true);
    platform.mockReturnValue('iPad');
    expect(onMac()).toBe(true);
    platform.mockReturnValue('Linux x86_64');
    expect(onMac()).toBe(false);
  });
});
