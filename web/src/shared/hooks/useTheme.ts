import { create } from 'zustand';

import { forgetVisitor, readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';
import type { StorageSource } from '@/shared/lib/visitor-storage';

/** The two themes, and only them (docs/architecture/web/03-ui-system.md#tema). */
export const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

/**
 * What a visitor asks for: one of the two themes, or the operating system's — which is the default,
 * and follows the system while the page is open
 * ([06 · D-32](../../../../docs/plans/06-workbench/decisions.md#d-32--o-que-a-f5-decidiu-na-execução)).
 */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Nobody picked: the operating system decides. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

const THEME_KEY = 'theme';

/** The media query the operating system answers. */
export const DARK_SCHEME = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
  return (THEME_PREFERENCES as readonly unknown[]).includes(value);
}

/** Whether the operating system asks for dark — `false` where nobody can say. */
function systemPrefersDark(): boolean {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia(DARK_SCHEME).matches
    : false;
}

/**
 * What a visitor asked for: the one they picked, and otherwise the system.
 *
 * A storage that throws — a private window, a blocked origin — or a value that is not one of the
 * three is somebody who never picked, never a broken screen (plan 06, S-86, S-206).
 */
export function initialThemePreference(storage?: StorageSource): ThemePreference {
  return (
    readVisitor(THEME_KEY, (value) => (isPreference(value) ? value : undefined), storage) ??
    DEFAULT_THEME_PREFERENCE
  );
}

/** The theme a preference puts on the page. */
export function resolveTheme(
  preference: ThemePreference,
  prefersDark: () => boolean = systemPrefersDark,
): Theme {
  if (preference === 'system') {
    return prefersDark() ? 'dark' : 'light';
  }

  return preference;
}

/** The theme a visitor starts with: the one they picked, and otherwise the operating system's. */
export function initialTheme(
  storage?: StorageSource,
  prefersDark: () => boolean = systemPrefersDark,
): Theme {
  return resolveTheme(initialThemePreference(storage), prefersDark);
}

/** Puts a theme on the page: the class every token hangs from, and the browser's own controls. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export interface ThemeState {
  /** What the visitor asked for. */
  readonly preference: ThemePreference;

  /** What is on the page. */
  readonly theme: Theme;

  /** Picks a theme by hand, and keeps the choice for this browser. */
  setTheme(theme: Theme): void;

  /** Picks one of the three, and keeps it — `system` forgets the choice. */
  setPreference(preference: ThemePreference): void;

  /** Picks the other theme by hand. */
  toggle(): void;

  /** The operating system changed its mind: followed only by somebody who asked it to decide. */
  systemChanged(prefersDark: boolean): void;
}

/**
 * The theme — interface state shared by the whole app, so a store of its own
 * (docs/architecture/web/04-state-and-data.md#onde-cada-estado-mora).
 */
export const useTheme = create<ThemeState>((set, get) => ({
  preference: initialThemePreference(),
  theme: initialTheme(),

  setTheme: (theme) => {
    get().setPreference(theme);
  },

  setPreference: (preference) => {
    if (preference === DEFAULT_THEME_PREFERENCE) {
      forgetVisitor(THEME_KEY);
    } else {
      writeVisitor(THEME_KEY, preference);
    }
    set({ preference, theme: resolveTheme(preference) });
  },

  toggle: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },

  systemChanged: (prefersDark) => {
    if (get().preference === 'system') {
      set({ theme: prefersDark ? 'dark' : 'light' });
    }
  },
}));
