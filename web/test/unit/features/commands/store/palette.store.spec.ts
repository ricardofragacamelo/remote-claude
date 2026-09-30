import { afterEach, describe, expect, it } from 'vitest';

import { usePalette } from '@/features/commands';

afterEach(() => {
  usePalette.getState().close();
});

describe('the palette — plan 06, S-125', () => {
  it('opens on the commands, with their prefix typed', () => {
    usePalette.getState().show();

    expect(usePalette.getState()).toMatchObject({ open: true, value: '>', mode: null });
  });

  it('opens on a mode entered by name, with nothing typed', () => {
    usePalette.getState().show('recent');

    expect(usePalette.getState()).toMatchObject({ open: true, value: '', mode: 'recent' });
  });

  it('asked to open while open, opens nothing more and keeps what was typed', () => {
    usePalette.getState().show();
    usePalette.getState().setValue('> open');
    usePalette.getState().show('recent');

    expect(usePalette.getState()).toMatchObject({ open: true, value: '> open', mode: null });
  });

  it('closed, forgets what was typed and the mode', () => {
    usePalette.getState().show('recent');
    usePalette.getState().close();

    expect(usePalette.getState()).toMatchObject({ open: false, value: '', mode: null });
  });
});
