import { describe, expect, it } from 'vitest';

import { claudeInitializationOf } from '@domain/engines/claude';
import type { ClaudeInitialization } from '@domain/engines/claude';
import type { SessionInitialization } from '@domain/session';

const bare: SessionInitialization = {
  commands: [],
  agents: [],
  models: [],
  account: { email: null, organization: null, plan: null, provider: null },
};

const full: ClaudeInitialization = {
  ...bare,
  outputStyle: 'Concise',
  outputStyles: ['default', 'Concise'],
  skills: [{ name: 'review', description: 'Reviews a PR', argumentHint: '', aliases: [] }],
  account: { ...bare.account, tokenSource: 'claude.ai', apiKeySource: 'none' },
};

describe('the initialisation Claude answers with — plan 13, D-05', () => {
  it('reads the output styles and the sources of the account straight off the answer', () => {
    expect(claudeInitializationOf(full)).toEqual(full);
  });

  it('reads nothing said as nothing, never as a guess', () => {
    expect(claudeInitializationOf(bare)).toEqual({
      ...bare,
      outputStyle: '',
      outputStyles: [],
      skills: [],
      account: { ...bare.account, tokenSource: null, apiKeySource: null },
    });
  });

  it('drops anything of the output styles that is not a string, and a style that is not one either', () => {
    const malformed = {
      ...bare,
      outputStyle: 7,
      outputStyles: ['default', 42, null],
    } as unknown as SessionInitialization;

    const read = claudeInitializationOf(malformed);

    expect(read.outputStyle).toBe('');
    expect(read.outputStyles).toEqual(['default']);
  });

  it('reads a list of output styles that is not an array as none', () => {
    const malformed = { ...bare, outputStyles: 'default' } as unknown as SessionInitialization;

    expect(claudeInitializationOf(malformed).outputStyles).toEqual([]);
  });
});
