import { describe, expect, it } from 'vitest';

import { claudeConversation } from '@adapter/outbound/engines/claude/claude-conversation';

const CANONICAL = '6b41b192-a41b-46c2-b8d7-5098d8c825be';

describe('claudeConversation — the rule of the engine, in its adapter (plan 28, B-11)', () => {
  it('names a conversation of Claude by the canonical UUID the SDK hands out', () => {
    const ref = claudeConversation(CANONICAL);

    expect(ref?.engine.value).toBe('claude');
    expect(ref?.id).toBe(CANONICAL);
    expect(ref?.key).toBe(`claude:${CANONICAL}`);
  });

  it.each([
    ['empty', ''],
    ['uppercase', CANONICAL.toUpperCase()],
    ['without hyphens', CANONICAL.replaceAll('-', '')],
    ['one character short', CANONICAL.slice(1)],
    ['a ULID — our own session id', '01J0ABCDEFGHJKMNPQRSTVWXYZ'],
    ['a path', '../../etc/passwd'],
  ])('names nothing by an identifier that is %s', (_case, raw) => {
    expect(claudeConversation(raw)).toBeNull();
  });
});
