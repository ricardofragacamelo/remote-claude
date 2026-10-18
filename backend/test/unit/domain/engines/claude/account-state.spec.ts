import { describe, expect, it } from 'vitest';

import { accountStateOf } from '@domain/engines/claude';
import type { ClaudeAccount } from '@domain/engines/claude';

const account: ClaudeAccount = {
  email: null,
  organization: null,
  plan: null,
  provider: 'firstParty',
  tokenSource: null,
  apiKeySource: null,
};

describe('the login, read off the account — plan 13, S-25', () => {
  it('reads a first-party account with no e-mail and no key as nobody signed in', () => {
    expect(accountStateOf(account)).toBe('loginRequired');
    expect(accountStateOf({ ...account, provider: null, apiKeySource: 'none' })).toBe(
      'loginRequired',
    );
  });

  it('reads an e-mail, a key, a token or a cloud provider as signed in', () => {
    expect(accountStateOf({ ...account, email: 'p@example.com' })).toBe('ready');
    expect(accountStateOf({ ...account, apiKeySource: 'ANTHROPIC_API_KEY' })).toBe('ready');
    expect(accountStateOf({ ...account, tokenSource: 'claude.ai' })).toBe('ready');
    expect(accountStateOf({ ...account, provider: 'bedrock' })).toBe('ready');
  });
});
