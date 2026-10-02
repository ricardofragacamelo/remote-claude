import { describe, expect, it } from 'vitest';

import {
  completionAt,
  mentionTarget,
  replaceCompletion,
} from '@/features/session/lib/composer-tokens';
import { offeredProviders } from '@/features/session/lib/mention-providers';
import type { MentionProvider } from '@/features/session/lib/mention-providers';

describe('what the cursor of the composer is completing — plan 08, B-48, B-50', () => {
  it('opens the `@` at the start or after blank space, up to the cursor', () => {
    expect(completionAt('@src/a', 6)).toEqual({ kind: 'mention', start: 0, query: 'src/a' });
    expect(completionAt('look at @do', 11)).toEqual({ kind: 'mention', start: 8, query: 'do' });
    expect(completionAt('look at @', 9)).toEqual({ kind: 'mention', start: 8, query: '' });
  });

  it('does not open for an address, nor after the mention ended', () => {
    expect(completionAt('mail a@b.c', 10)).toBeNull();
    expect(completionAt('@a.ts and', 9)).toBeNull();
  });

  it('opens the `/` only at the very start, before any blank space — S-241', () => {
    expect(completionAt('/rev', 4)).toEqual({ kind: 'command', start: 0, query: 'rev' });
    expect(completionAt('/', 1)).toEqual({ kind: 'command', start: 0, query: '' });
    expect(completionAt('/review now', 11)).toBeNull();
    expect(completionAt('say /x', 6)).toBeNull();
  });

  it('replaces what is being completed, and puts the cursor after it — S-248', () => {
    const text = 'see @sr then';

    expect(replaceCompletion(text, 7, { kind: 'mention', start: 4, query: 'sr' }, '')).toEqual({
      text: 'see  then',
      cursor: 4,
    });
    expect(
      replaceCompletion('/re', 3, { kind: 'command', start: 0, query: 're' }, '/review '),
    ).toEqual({
      text: '/review ',
      cursor: 8,
    });
  });

  it('reads the level and the partial name of a query, and what climbs out — S-230', () => {
    expect(mentionTarget('src/comp')).toEqual({
      directory: 'src',
      partial: 'comp',
      outside: false,
    });
    expect(mentionTarget('readme')).toEqual({ directory: '', partial: 'readme', outside: false });
    expect(mentionTarget('../x').outside).toBe(true);
    expect(mentionTarget('/etc/passwd').outside).toBe(true);
    expect(mentionTarget('a/../../b').outside).toBe(true);
  });
});

describe('the providers of the `@` — S-231', () => {
  const provider = (keyword: string, items: MentionProvider['items']): MentionProvider => ({
    id: keyword,
    position: 1,
    keyword,
    labelKey: 'x',
    descriptionKey: 'y',
    items,
  });

  it('offers a provider whose keyword starts with what was typed, with what it has now', () => {
    const selection = provider('selection', () => [
      {
        id: 'r',
        kind: 'range',
        path: 'a.ts',
        startLine: 1,
        endLine: 2,
        size: null,
        binary: false,
        missing: false,
      },
    ]);

    expect(offeredProviders([selection], '/f', 'sel').map((each) => each.provider.id)).toEqual([
      'selection',
    ]);
    expect(offeredProviders([selection], '/f', 'term')).toEqual([]);
  });

  it('leaves out a provider with nothing to give — the terminal before plan 12, or switched off', () => {
    const terminal = provider('terminal', () => null);
    const empty = provider('selection', () => []);

    expect(offeredProviders([terminal, empty], '/f', '')).toEqual([]);
  });
});
