import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyTheme,
  initialTheme,
  initialThemePreference,
  resolveTheme,
  useTheme,
} from '@/shared/hooks/useTheme';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import type { VisitorStorage } from '@/shared/lib/visitor-storage';

function saved(value: string | null): () => VisitorStorage {
  return () => ({ getItem: () => value, setItem: () => undefined });
}

const blocked = (): VisitorStorage => {
  throw new DOMException('blocked', 'SecurityError');
};

describe('the theme a visitor starts with — plan 06, S-86', () => {
  it('is dark when the operating system asks for dark and nothing was picked', () => {
    expect(initialTheme(saved(null), () => true)).toBe('dark');
  });

  it('is light when the operating system does not ask for dark', () => {
    expect(initialTheme(saved(null), () => false)).toBe('light');
  });

  it('is the one the visitor picked, whatever the system asks', () => {
    expect(initialTheme(saved('"light"'), () => true)).toBe('light');
    expect(initialTheme(saved('"dark"'), () => false)).toBe('dark');
  });

  it('ignores a saved value that is no theme of this build', () => {
    expect(initialTheme(saved('"solarized"'), () => true)).toBe('dark');
  });

  it('falls back to the system when the storage throws — no error, no broken screen', () => {
    expect(initialTheme(blocked, () => true)).toBe('dark');
    expect(initialTheme(blocked, () => false)).toBe('light');
  });

  it('asks the browser when nothing is injected, and the browser here says nothing', () => {
    expect(initialTheme()).toBe('light');
  });
});

describe('picking a theme', () => {
  it('keeps the choice for this browser', () => {
    useTheme.getState().setTheme('dark');

    expect(useTheme.getState().theme).toBe('dark');
    expect(localStorage.getItem(`${VISITOR_PREFIX}theme`)).toBe('"dark"');
  });

  it('toggles between the two, and only them', () => {
    useTheme.setState({ theme: 'light' });

    useTheme.getState().toggle();
    expect(useTheme.getState().theme).toBe('dark');

    useTheme.getState().toggle();
    expect(useTheme.getState().theme).toBe('light');
  });

  it('puts the theme on the page — the class every token hangs from, and the browser controls', () => {
    const root = document.createElement('html');

    applyTheme('dark', root);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');

    applyTheme('light', root);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.colorScheme).toBe('light');
  });

  it('puts it on the document when no element is named', () => {
    applyTheme('dark');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyTheme('light');
  });
});

describe('the theme a visitor asks for — plan 06, S-143, S-202, S-206', () => {
  const dark = (matches: boolean) =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is the system for somebody who never picked', () => {
    expect(initialThemePreference(saved(null))).toBe('system');
  });

  it('is what they picked, the system included', () => {
    expect(initialThemePreference(saved('"dark"'))).toBe('dark');
    expect(initialThemePreference(saved('"system"'))).toBe('system');
  });

  it('is the system when what was kept is not one of the three, or cannot be read — S-206', () => {
    expect(initialThemePreference(saved('"sepia"'))).toBe('system');
    expect(initialThemePreference(blocked)).toBe('system');
  });

  it('puts the operating system’s theme on the page for "the system"', () => {
    expect(resolveTheme('system', () => true)).toBe('dark');
    expect(resolveTheme('system', () => false)).toBe('light');
    expect(resolveTheme('light', () => true)).toBe('light');
  });

  it('follows the operating system while it asked to — S-202', () => {
    dark(false);
    useTheme.getState().setPreference('system');
    expect(useTheme.getState().theme).toBe('light');

    useTheme.getState().systemChanged(true);

    expect(useTheme.getState().theme).toBe('dark');
  });

  it('does not follow it for somebody who picked a theme by hand — S-202', () => {
    useTheme.getState().setPreference('light');

    useTheme.getState().systemChanged(true);

    expect(useTheme.getState()).toMatchObject({ preference: 'light', theme: 'light' });
  });

  it('keeps a theme picked by hand, and forgets it when "the system" is picked again', () => {
    dark(true);
    useTheme.getState().setPreference('light');
    expect(localStorage.getItem(`${VISITOR_PREFIX}theme`)).toBe('"light"');

    useTheme.getState().setPreference('system');

    expect(localStorage.getItem(`${VISITOR_PREFIX}theme`)).toBeNull();
    expect(useTheme.getState()).toMatchObject({ preference: 'system', theme: 'dark' });
  });

  it('turns the toggle into a choice by hand', () => {
    useTheme.setState({ preference: 'system', theme: 'dark' });

    useTheme.getState().toggle();

    expect(useTheme.getState()).toMatchObject({ preference: 'light', theme: 'light' });
  });
});
