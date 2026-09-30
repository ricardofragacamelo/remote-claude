import type { PaletteMode } from '../types/command';

/** The mode the palette is in, and what was typed after its prefix. */
export interface ModeMatch {
  readonly mode: PaletteMode;
  readonly query: string;
}

/**
 * The mode the palette is in: the one entered by name, or the one whose prefix the field starts
 * with — the longest, so a mode of `>>` would never be shadowed by `>`. A mode with an empty prefix
 * (the Quick Open of plan 09) is what is left when no other matches; with none, there is no mode,
 * and the palette says which prefixes there are (plan 06, S-124).
 */
export function modeFor(
  modes: readonly PaletteMode[],
  value: string,
  entered: string | null,
): ModeMatch | null {
  if (entered !== null) {
    const named = modes.find((mode) => mode.id === entered);
    return named === undefined ? null : { mode: named, query: value.trim() };
  }

  const matched = modes
    .flatMap((mode) =>
      mode.prefix !== undefined && value.startsWith(mode.prefix)
        ? [{ mode, prefix: mode.prefix }]
        : [],
    )
    .sort((left, right) => right.prefix.length - left.prefix.length)[0];

  return matched === undefined
    ? null
    : { mode: matched.mode, query: value.slice(matched.prefix.length).trim() };
}

/** Text as a search compares it: no case, no accents — "abrir" finds "Abrir", "ação" finds "acao". */
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

/**
 * Whether a label, written as the palette writes it ("File: Open folder…"), answers a search: every
 * word of the search in it, in any order — so the category narrows as well as the label.
 */
export function matchesSearch(text: string, query: string): boolean {
  const haystack = folded(text);

  return folded(query)
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => haystack.includes(word));
}
