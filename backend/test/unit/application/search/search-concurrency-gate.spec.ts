import { describe, expect, it } from 'vitest';

import { SearchConcurrencyGate } from '@application/search';
import { SearchRateLimitedError } from '@domain/search';

describe('SearchConcurrencyGate — S-73, S-74', () => {
  it('allows up to the configured number of concurrent searches for one user', () => {
    const gate = new SearchConcurrencyGate(2);

    gate.acquire('user-1');
    gate.acquire('user-1');

    expect(() => gate.acquire('user-1')).toThrow(SearchRateLimitedError);
  });

  it('carries scope: search and the limit in the refusal', () => {
    const gate = new SearchConcurrencyGate(1);
    gate.acquire('user-1');

    try {
      gate.acquire('user-1');
      expect.unreachable();
    } catch (error) {
      expect((error as SearchRateLimitedError).params).toMatchObject({ scope: 'search', limit: 1 });
    }
  });

  it('frees a slot on release, letting the next acquire through', () => {
    const gate = new SearchConcurrencyGate(1);
    gate.acquire('user-1');
    gate.release('user-1');

    expect(() => gate.acquire('user-1')).not.toThrow();
  });

  it('never lets two users compete for the same slot — S-74', () => {
    const gate = new SearchConcurrencyGate(1);
    gate.acquire('user-1');

    expect(() => gate.acquire('user-2')).not.toThrow();
  });

  it('a release when more than one slot is held only frees one', () => {
    const gate = new SearchConcurrencyGate(2);
    gate.acquire('user-1');
    gate.acquire('user-1');

    gate.release('user-1');

    expect(() => gate.acquire('user-1')).not.toThrow();
    expect(() => gate.acquire('user-1')).toThrow(SearchRateLimitedError);
  });

  it('releasing more than was acquired never goes negative', () => {
    const gate = new SearchConcurrencyGate(1);
    gate.release('user-1');
    gate.release('user-1');

    expect(() => gate.acquire('user-1')).not.toThrow();
  });
});
