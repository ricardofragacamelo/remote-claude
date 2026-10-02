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
   * Opens the palette — on the commands, or on a mode entered by name. Asked again while open, it
   * does not open a second one, nor drop what was typed (plan 06, S-125).
   */
  show(mode?: string): void;
  setValue(value: string): void;
  close(): void;
}

/** The palette: one for the app, opened from anywhere. */
export const usePalette = create<PaletteState>((set, get) => ({
  open: false,
  value: '',
  mode: null,

  show: (mode) => {
    if (get().open) {
      return;
    }

    set(
      mode === undefined
        ? { open: true, mode: null, value: COMMANDS_PREFIX }
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
