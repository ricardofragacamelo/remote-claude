import { describe, expect, it } from 'vitest';

import {
  effectiveOutputStyle,
  NO_OUTPUT_STYLE,
  outputStyleForSession,
} from '@domain/engines/claude';
import type { OutputStyleDefaults } from '@domain/engines/claude';

describe('the output style of Claude’s sessions — plan 13, D-04, D-06; plan 28, D-06', () => {
  it('is nothing set anywhere by default', () => {
    expect(NO_OUTPUT_STYLE).toEqual({ user: null, overrides: [] });
  });

  it('puts the nearest folder over the user over the installation', () => {
    const stored: OutputStyleDefaults = {
      user: 'default',
      overrides: [{ folder: '/srv/repo', value: 'Concise' }],
    };

    expect(effectiveOutputStyle(stored, '/srv/repo/pkg')).toEqual({
      value: 'Concise',
      from: 'folder',
      folder: '/srv/repo',
    });
    expect(effectiveOutputStyle(stored, '/elsewhere')).toEqual({ value: 'default', from: 'user' });
    expect(effectiveOutputStyle(NO_OUTPUT_STYLE, null)).toEqual({
      value: null,
      from: 'installation',
    });
  });

  describe('what a session opens with — S-53', () => {
    it('keeps the effective style when the installation offers it', () => {
      expect(
        outputStyleForSession({ value: 'Concise', from: 'user' }, ['default', 'Concise']),
      ).toEqual({ outputStyle: 'Concise', stale: [] });
    });

    it('drops a style the installation no longer has, and says so', () => {
      expect(outputStyleForSession({ value: 'Deleted', from: 'user' }, ['default'])).toEqual({
        outputStyle: null,
        stale: ['outputStyle'],
      });
    });

    it('drops nothing while the installation’s styles are not known yet', () => {
      expect(outputStyleForSession({ value: 'Mine', from: 'user' }, null)).toEqual({
        outputStyle: 'Mine',
        stale: [],
      });
    });

    it('opens with none set as none, whatever the installation offers', () => {
      expect(outputStyleForSession({ value: null, from: 'installation' }, ['default'])).toEqual({
        outputStyle: null,
        stale: [],
      });
    });
  });
});
