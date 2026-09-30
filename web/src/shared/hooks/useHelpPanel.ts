import { create } from 'zustand';

import { readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';
import type { StorageSource } from '@/shared/lib/visitor-storage';

/** The four fixed parts of every help panel, in the order they show. */
export const HELP_SECTIONS = ['what', 'states', 'notRecorded', 'shortcuts'] as const;

export type HelpSection = (typeof HELP_SECTIONS)[number];

const HELP_KEY = 'help.open';

/** Whether the help was left open in this browser — closed for somebody who never opened it. */
export function initialHelpOpen(storage?: StorageSource): boolean {
  return (
    readVisitor(HELP_KEY, (value) => (typeof value === 'boolean' ? value : undefined), storage) ??
    false
  );
}

export interface HelpPanelState {
  readonly open: boolean;

  /** The part a "learn more" asked for, until the panel has shown it. */
  readonly section: HelpSection | null;

  /** How many screens with a help are on screen. */
  readonly hosts: number;

  /**
   * How many times somebody asked for the help — the button, `Shift+F1`, a "learn more". The help
   * of the workbench is a sheet over the tab, and opens on a request, never because the panel was
   * left open on another screen.
   */
  readonly requested: number;

  /** A screen with a help is on screen, until the returned function is called. */
  attach(): () => void;

  setOpen(open: boolean): void;

  /** Opens the panel — at one of its parts, when a control asked about that one. */
  show(section?: HelpSection): void;

  /** The part asked for is on screen. */
  shown(): void;
}

/**
 * The help panel of the screen frame: open or closed, remembered per visitor.
 *
 * One panel for the whole app, not one per screen: somebody who reads the help reads it on the next
 * screen too, and opening it twice is still one panel (plan 06, S-95).
 */
export const useHelpPanel = create<HelpPanelState>((set) => ({
  open: initialHelpOpen(),
  section: null,
  hosts: 0,
  requested: 0,

  attach: () => {
    set((state) => ({ hosts: state.hosts + 1 }));
    let attached = true;

    return () => {
      if (attached) {
        attached = false;
        set((state) => ({ hosts: state.hosts - 1 }));
      }
    };
  },

  setOpen: (open) => {
    writeVisitor(HELP_KEY, open);
    set(open ? { open } : { open, section: null });
  },

  show: (section) => {
    writeVisitor(HELP_KEY, true);
    set((state) => ({ open: true, section: section ?? null, requested: state.requested + 1 }));
  },

  shown: () => {
    set({ section: null });
  },
}));
