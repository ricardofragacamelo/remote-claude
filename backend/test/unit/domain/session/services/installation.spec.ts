import { describe, expect, it } from 'vitest';

import {
  categoryIdOf,
  EffortUnsupportedError,
  ForkPointUnknownError,
  forkPointOf,
  refuseUnsupportedEffort,
} from '@domain/session';
import type { InstallationModel } from '@domain/session';

const model = (overrides: Partial<InstallationModel> = {}): InstallationModel => ({
  value: 'sonnet',
  resolvedModel: 'claude-sonnet-5',
  displayName: 'Sonnet',
  description: 'Sonnet 5',
  supportsEffort: true,
  supportedEffortLevels: ['low', 'high'],
  ...overrides,
});

describe('what the installation says about itself — plan 08, F4', () => {
  it('refuses an effort the model does not take, by its alias or by its id — S-171', () => {
    const models = [
      model(),
      model({
        value: 'haiku',
        resolvedModel: null,
        supportsEffort: false,
        supportedEffortLevels: [],
      }),
    ];

    expect(() => refuseUnsupportedEffort(models, 'sonnet', 'max')).toThrow(EffortUnsupportedError);
    expect(() => refuseUnsupportedEffort(models, 'claude-sonnet-5', 'max')).toThrow(
      EffortUnsupportedError,
    );
    expect(() => refuseUnsupportedEffort(models, 'haiku', 'low')).toThrow(EffortUnsupportedError);
    expect(() => refuseUnsupportedEffort(models, 'sonnet', 'high')).not.toThrow();
    // A model the list does not name is not refused: the list is discovery.
    expect(() => refuseUnsupportedEffort(models, 'claude-other', 'max')).not.toThrow();
  });

  it('names the categories of the context window for a screen to translate', () => {
    expect(categoryIdOf('System tools (deferred)')).toBe('systemToolsDeferred');
    expect(categoryIdOf('Free space')).toBe('freeSpace');
    expect(categoryIdOf('MCP tools')).toBe('mcpTools');
    expect(categoryIdOf('')).toBe('');
  });
});

describe('where an edit-and-resend forks from — D-19', () => {
  const chain = [
    { id: 'u1', isPrompt: true },
    { id: 'a1', isPrompt: false },
    { id: 'r1', isPrompt: false },
    { id: 'u2', isPrompt: true },
    { id: 'a2', isPrompt: false },
  ];

  it('keeps everything before the prompt, and drops its turn — S-161', () => {
    expect(forkPointOf(chain, 'u2')).toEqual({ kind: 'after', keepUpTo: 'r1', dropsTurn: 'u2' });
  });

  it('keeps nothing from the first prompt — a fresh conversation — S-165', () => {
    expect(forkPointOf(chain, 'u1')).toEqual({ kind: 'start' });
  });

  it('refuses a message that is not a prompt of the conversation — S-163', () => {
    expect(() => forkPointOf(chain, 'a1')).toThrow(ForkPointUnknownError);
    expect(() => forkPointOf(chain, 'nowhere')).toThrow(ForkPointUnknownError);
  });
});
