import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

import type { RegistryEntry } from '@/shared/lib/registry';

/** Where a command is filed — what the palette writes before its label ("File: Open folder…"). */
export const COMMAND_CATEGORIES = [
  'file',
  'view',
  'go',
  'preferences',
  'help',
  'notifications',
] as const;

export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

/** The groups of the File menu, in the order of the editor people know. */
export const FILE_MENU_GROUPS = ['new', 'open', 'save', 'close'] as const;

export type FileMenuGroup = (typeof FILE_MENU_GROUPS)[number];

/** Where a command sits in the File menu, when it is one of its items. */
export interface FileMenuPlacement {
  readonly group: FileMenuGroup;

  /** Smaller first, inside the group. */
  readonly order: number;

  /**
   * What opens to the right of the item instead of running the command — "Open recent ›". The
   * items it renders are the menu's own (`MenubarItem`).
   */
  readonly submenu?: ComponentType;
}

/**
 * Something a person can do by name: from the palette, from the File menu, from a shortcut — the
 * same label and the same shortcut in the three (docs/architecture/web/03-ui-system.md#comandos-atalhos-e-a-paleta).
 */
export interface Command {
  /** `<owner>.<what>` — `workspace.openFolder`. Two plans claiming one id is refused. */
  readonly id: string;

  /** A translation key, named in full where the command is declared. */
  readonly labelKey: string;
  readonly labelParams?: Readonly<Record<string, string | number>>;
  readonly category: CommandCategory;
  readonly icon?: LucideIcon;

  /**
   * Whether it can run **now** — a folder tab to close, a second tab to go to. Asked every time it
   * would show or run: unavailable, the palette hides it, the menu disables it and its shortcut
   * does nothing. Absent means always.
   */
  when?(): boolean;

  /** A failure it throws — or a promise that rejects — becomes a translated notification. */
  run(): void | Promise<void>;
  readonly fileMenu?: FileMenuPlacement;
}

/**
 * Where a shortcut applies, the most specific last — a press answers to the binding of the most
 * specific live context. `global` is everywhere; `workbench` only while the workbench is on screen,
 * and wins over `global` there; `explorer` only while the focus is in the tree of the Explorer
 * (plan 07, B-26) — `Delete`, `F2` and `Ctrl+C` there act on files, and nowhere else; `pdfPointer`
 * while the pointer is over a PDF reader, and `pdfReader` while the focus is in one (plan 21,
 * D-10) — its `Ctrl+F` finds in the PDF, over the editor's.
 */
export const KEY_CONTEXTS = ['global', 'workbench', 'explorer', 'pdfPointer', 'pdfReader'] as const;

export type KeyContext = (typeof KEY_CONTEXTS)[number];

/** A key bound to a command, in a context. */
export interface Keybinding {
  readonly command: string;

  /**
   * The chord, `+`-separated, the key last: `Mod+Shift+P`, `Alt+1`, `Ctrl+Alt+PageDown`. `Mod` is
   * `Ctrl` — and `Cmd` on a Mac. A sequence is its chords separated by a space: `Mod+K S` is
   * `Ctrl+K`, then `S`.
   */
  readonly key: string;

  /** The chord on a Mac, when it is not `key` with `Mod` read as `Cmd`. */
  readonly mac?: string;
  readonly context: KeyContext;

  /**
   * Whether it fires with the focus in a text field. Only the palette's does: a shortcut of the shell
   * typed into a prompt would take the keys from what is being written.
   */
  readonly allowInInput?: boolean;
}

/** A shortcut as a person reads it and as `aria-keyshortcuts` announces it. */
export interface ShortcutLabel {
  readonly label: string;
  readonly aria: string;
}

/** What a mode of the palette is given to draw its options. */
export interface PaletteModeProps {
  /** What was typed after the mode's prefix. */
  readonly query: string;

  /** Closes the palette, gives the focus back, and only then runs `action`. */
  pick(action: () => void): void;
}

/**
 * A mode of the palette: `>` for commands (plan 06), the Quick Open of plan 11 with its own. Plans
 * register theirs; the palette never changes for it.
 */
export interface PaletteMode extends RegistryEntry {
  /**
   * What typed first puts the palette in this mode. Absent: the mode is only entered by name — the
   * "Open recent" list is.
   */
  readonly prefix?: string;

  /** What the field says while empty — named in full. */
  readonly placeholderKey: string;

  /** The options, as `CommandItem`s. */
  readonly component: ComponentType<PaletteModeProps>;
}
