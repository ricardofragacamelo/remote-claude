import { create } from 'zustand';

import { createRegistry } from '@/shared/lib/registry';
import type { PaletteMode } from '../types/command';

/** What `>` puts the palette in: the commands. */
export const COMMANDS_PREFIX = '>';

export interface PaletteState {
  readonly open: boolean;

  /** What the field holds — the prefix of the mode included. */
  readonly value: string;

  /** A mode entered by name, which has no prefix to be found by; `null` for "by what is typed". */
  readonly mode: string | null;

  /**
   * Opens the palette — on the commands, on a mode entered by name, or, with neither, blank with
   * `value` already in the field for {@link PaletteState.mode}'s own prefix matching to read as if
   * it had been typed (plan 11's Quick Open opens this way: blank, so its own empty prefix is what
   * matches until something else is typed over it). Asked again while open, it does not open a
   * second one, nor drop what was typed (plan 06, S-125).
   */
  show(mode?: string, value?: string): void;
  setValue(value: string): void;
  close(): void;
}

/** The palette: one for the app, opened from anywhere. */
export const usePalette = create<PaletteState>((set, get) => ({
  open: false,
  value: '',
  mode: null,

  show: (mode, value) => {
    if (get().open) {
      return;
    }

    set(
      mode === undefined
        ? { open: true, mode: null, value: value ?? COMMANDS_PREFIX }
        : { open: true, mode, value: '' },
    );
  },
  setValue: (value) => {
    set({ value });
  },
  close: () => {
    set({ open: false, value: '', mode: null });
  },
}));

/** The modes of the palette. The commands' is the palette's own; plan 11 registers Quick Open. */
export const paletteModes = createRegistry<PaletteMode>('palette modes');
