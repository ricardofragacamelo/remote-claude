import { describe, expect, it } from 'vitest';

import { matchesSearch, modeFor } from '@/features/commands/hooks/palette-filter';
import type { PaletteMode } from '@/features/commands';

function aMode(id: string, prefix?: string): PaletteMode {
  return {
    id,
    position: 100,
    placeholderKey: 'palette.commands.placeholder',
    component: () => null,
    ...(prefix === undefined ? {} : { prefix }),
  };
}

const commands = aMode('commands', '>');

describe('the mode of the palette — plan 06, S-124', () => {
  it('is the commands for what starts with >, and the query is what follows', () => {
    expect(modeFor([commands], '> open  ', null)).toEqual({ mode: commands, query: 'open' });
  });

  it('is a mode another plan registered, with the palette unchanged', () => {
    const quickOpen = aMode('quickOpen', '');

    expect(modeFor([commands, quickOpen], 'readme', null)).toEqual({
      mode: quickOpen,
      query: 'readme',
    });
    expect(modeFor([commands, quickOpen], '>theme', null)?.mode).toBe(commands);
  });

  it('picks the longest prefix that matches, so none shadows another', () => {
    const symbols = aMode('symbols', '>>');

    expect(modeFor([commands, symbols], '>>x', null)).toEqual({ mode: symbols, query: 'x' });
  });

  it('is no mode when nothing matches — and never one entered only by name', () => {
    expect(modeFor([commands, aMode('recent')], 'open', null)).toBeNull();
  });

  it('is the mode entered by name, whatever is typed, while it is registered', () => {
    const recent = aMode('recent');

    expect(modeFor([commands, recent], ' app ', 'recent')).toEqual({ mode: recent, query: 'app' });
    expect(modeFor([commands], 'app', 'recent')).toBeNull();
  });
});

describe('what a search finds — plan 06, S-123', () => {
  it('finds by the label and by the category, in any order and any case', () => {
    expect(matchesSearch('File: Open folder…', 'open')).toBe(true);
    expect(matchesSearch('File: Open folder…', 'folder file')).toBe(true);
    expect(matchesSearch('File: Open folder…', 'save')).toBe(false);
  });

  it('ignores accents both ways', () => {
    expect(matchesSearch('Preferências: Mudar o idioma', 'preferencias')).toBe(true);
    expect(matchesSearch('Arquivo: Abrir pasta…', 'ÁBRIR')).toBe(true);
  });

  it('finds everything for an empty search', () => {
    expect(matchesSearch('anything', '   ')).toBe(true);
  });
});
