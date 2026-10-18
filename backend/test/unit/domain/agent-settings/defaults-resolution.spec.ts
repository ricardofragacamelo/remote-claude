import { describe, expect, it } from 'vitest';

import {
  effectiveDefaults,
  isWithin,
  nearestOverride,
  NO_DEFAULTS,
  sameDefaults,
  valuesOf,
} from '@domain/agent-settings';
import type { AgentDefaults } from '@domain/agent-settings';

const set = (values: Partial<AgentDefaults>): AgentDefaults => ({ ...NO_DEFAULTS, ...values });

describe('where a default applies — plan 13, D-04; plan 28, D-06', () => {
  it('reads a folder as within itself and its subfolders, by segment — never by prefix', () => {
    expect(isWithin('/srv/repo', '/srv/repo')).toBe(true);
    expect(isWithin('/srv/repo/a/b', '/srv/repo')).toBe(true);
    expect(isWithin('/srv/repo/a', '/srv/repo/')).toBe(true);
    expect(isWithin('/srv/repo-old', '/srv/repo')).toBe(false);
    expect(isWithin('/anything', '/')).toBe(true);
  });

  it('takes the override of the folder itself, or its nearest ancestor that has one — S-38', () => {
    const overrides = [
      { folder: '/srv', values: set({ model: 'haiku' }) },
      { folder: '/srv/repo', values: set({ model: 'sonnet' }) },
    ];

    expect(nearestOverride(overrides, '/srv/repo/pkg')?.folder).toBe('/srv/repo');
    expect(nearestOverride(overrides, '/srv/other')?.folder).toBe('/srv');
    expect(nearestOverride(overrides, '/home')).toBeNull();
    expect(nearestOverride(overrides, null)).toBeNull();
  });

  it('puts the nearest folder over the user over the installation, field by field — S-37, S-38', () => {
    const effective = effectiveDefaults({
      user: set({ model: 'haiku', permissionMode: 'readOnly' }),
      overrides: [{ folder: '/srv/repo', values: set({ model: 'sonnet', effort: 'high' }) }],
      folder: '/srv/repo/pkg',
    });

    expect(effective.model).toEqual({ value: 'sonnet', from: 'folder', folder: '/srv/repo' });
    expect(effective.permissionMode).toEqual({ value: 'readOnly', from: 'user' });
    expect(effective.thinking).toEqual({ value: null, from: 'installation' });
    expect(valuesOf(effective)).toEqual(
      set({ model: 'sonnet', permissionMode: 'readOnly', effort: 'high' }),
    );
  });

  it('applies the user default alone, with no folder in view, and nothing without any', () => {
    expect(effectiveDefaults({ user: null, overrides: [], folder: null }).model.from).toBe(
      'installation',
    );
    expect(
      effectiveDefaults({ user: set({ model: 'haiku' }), overrides: [], folder: null }).model,
    ).toEqual({
      value: 'haiku',
      from: 'user',
    });
  });

  it('tells two defaults that set the same thing from two that do not — S-43', () => {
    expect(sameDefaults(set({ model: 'x' }), set({ model: 'x' }))).toBe(true);
    expect(sameDefaults(set({ model: 'x' }), set({ model: 'y' }))).toBe(false);
  });
});
