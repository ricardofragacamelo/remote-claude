import { describe, expect, it } from 'vitest';

import { occurrencesIn } from '@/features/session/lib/conversation-search';
import type { StreamMessage } from '@/features/session/types/live-session';

function message(
  messageId: string,
  texts: readonly string[],
  streaming: string | null = null,
): StreamMessage {
  return {
    messageId,
    role: 'assistant',
    text: texts.join(''),
    blocks: texts.map((text) => ({ kind: 'text' as const, text })),
    streaming: streaming === null ? null : { kind: 'text' as const, text: streaming },
    isComplete: streaming === null,
    parentToolUseId: null,
    thinkingMs: null,
    thinkingSince: null,
  };
}

describe('searching what was said — plan 08 B-24', () => {
  it('gives one entry per occurrence, in the order of the conversation, case aside', () => {
    const messages = [message('m1', ['Clock is wrong.']), message('m2', ['clock, CLOCK'])];

    expect(occurrencesIn(messages, 'clock')).toEqual(['m1', 'm2', 'm2']);
  });

  it('searches every block of a message, the thinking included', () => {
    expect(occurrencesIn([message('m1', ['about the cache', 'the cache again'])], 'cache')).toEqual(
      ['m1', 'm1'],
    );
  });

  it('includes what is still arriving — S-102', () => {
    expect(occurrencesIn([message('m1', [], 'streaming cache')], 'cache')).toEqual(['m1']);
  });

  it('finds nothing for a search that is not there — S-102', () => {
    expect(occurrencesIn([message('m1', ['hello'])], 'absent')).toEqual([]);
  });

  it('finds nothing for an empty or blank search', () => {
    expect(occurrencesIn([message('m1', ['hello'])], '   ')).toEqual([]);
  });

  it('counts occurrences that do not overlap', () => {
    expect(occurrencesIn([message('m1', ['aaaa'])], 'aa')).toEqual(['m1', 'm1']);
  });
});
