import { create } from 'zustand';

import { isRecord } from '@/shared/lib/json';
import { readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';
import type { StorageSource } from '@/shared/lib/visitor-storage';
import { AUTO_SAVE_MODES, EDITOR_FONTS } from '../types/editor';
import type { EditorPreferences } from '../types/editor';

/** What somebody who never changed a thing has — auto-save off (B-39). */
export const DEFAULT_PREFERENCES: EditorPreferences = {
  font: 'code',
  fontSize: 13,
  zoom: 100,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: false,
  minimap: true,
  autoSave: 'off',
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
};

/** The values each numeric preference may take. */
export const FONT_SIZES = [12, 13, 14, 16, 18] as const;
export const ZOOMS = [80, 90, 100, 110, 125, 150] as const;
export const TAB_SIZES = [2, 4, 8] as const;

const PREFERENCES_KEY = 'editor.preferences';

function oneOf<T>(values: readonly T[], value: unknown, fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Kept preferences, as far as they can be trusted: each one that is not one of its values is its
 * default — a hand-written or older value never breaks the editor.
 */
export function preferencesFrom(value: unknown): EditorPreferences | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const d = DEFAULT_PREFERENCES;

  return {
    font: oneOf(EDITOR_FONTS, value['font'], d.font),
    fontSize: oneOf<number>(FONT_SIZES, value['fontSize'], d.fontSize),
    zoom: oneOf<number>(ZOOMS, value['zoom'], d.zoom),
    tabSize: oneOf<number>(TAB_SIZES, value['tabSize'], d.tabSize),
    insertSpaces: flag(value['insertSpaces'], d.insertSpaces),
    wordWrap: flag(value['wordWrap'], d.wordWrap),
    minimap: flag(value['minimap'], d.minimap),
    autoSave: oneOf(AUTO_SAVE_MODES, value['autoSave'], d.autoSave),
    trimTrailingWhitespace: flag(value['trimTrailingWhitespace'], d.trimTrailingWhitespace),
    insertFinalNewline: flag(value['insertFinalNewline'], d.insertFinalNewline),
  };
}

/** The preferences this visitor kept — the defaults when the browser keeps nothing (S-258). */
export function initialPreferences(storage?: StorageSource): EditorPreferences {
  return readVisitor(PREFERENCES_KEY, preferencesFrom, storage) ?? DEFAULT_PREFERENCES;
}

export interface PreferencesState {
  readonly preferences: EditorPreferences;

  /** Changes one preference, for every tab at once, and keeps it for this browser. */
  set<K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]): void;
}

/**
 * The editor's preferences, for every tab of every folder (S-257) — a convenience of this browser,
 * kept by visitor storage: a storage that throws is a visitor with the defaults, never a broken
 * editor (docs/architecture/web/04-state-and-data.md#estado-de-aba-de-pasta).
 */
export const useEditorPreferences = create<PreferencesState>((set, get) => ({
  preferences: initialPreferences(),
  set: (key, value) => {
    const preferences = { ...get().preferences, [key]: value };
    writeVisitor(PREFERENCES_KEY, preferences);
    set({ preferences });
  },
}));
