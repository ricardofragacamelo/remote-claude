import { describe, expect, it } from 'vitest';

import { activityOf, inferWorking } from '@domain/transcript';
import type { TranscriptMessage } from '@domain/transcript';
import { aTranscriptSession } from '../../../../support/builders/transcript.builder';

/** One entry made of the given events. */
function entryOf(
  ...events: { type: string; payload: Record<string, unknown> }[]
): TranscriptMessage {
  return { id: `e${String(events.length)}`, events };
}

const answer = (...content: Record<string, unknown>[]) =>
  entryOf({ type: 'message.completed', payload: { messageId: 'm', role: 'assistant', content } });
const text = answer({ type: 'text', text: 'done' });
const thinking = answer({ type: 'thinking' });
const toolCall = entryOf(
  {
    type: 'message.completed',
    payload: { messageId: 'm', role: 'assistant', content: [{ type: 'tool_use' }] },
  },
  { type: 'tool.started', payload: { toolUseId: 't', toolName: 'Bash', input: {} } },
);
const toolResult = entryOf({
  type: 'tool.completed',
  payload: { toolUseId: 't', status: 'succeeded' },
});
const prompt = entryOf({
  type: 'message.completed',
  payload: { messageId: 'u', role: 'user', content: [{ type: 'text', text: 'go' }] },
});

describe('inferWorking — plan 22, B-15', () => {
  it.each([
    ['a tool call without its result', toolCall],
    ['a thinking', thinking],
    ['a prompt without an answer', prompt],
    ['a tool result not answered yet', toolResult],
  ])('is working after %s while active elsewhere — S-45', (_, last) => {
    expect(inferWorking([text, last], 'activeElsewhere')).toBe(true);
  });

  it('is not working after the text that closes the turn — S-46', () => {
    expect(inferWorking([toolCall, toolResult, text], 'activeElsewhere')).toBe(false);
  });

  it.each(['idle', 'liveHere'] as const)(
    'is never working when the conversation is %s — S-47',
    (activity) => {
      for (const last of [toolCall, thinking, prompt]) {
        expect(inferWorking([last], activity)).toBe(false);
      }
    },
  );

  it.each([
    [119_000, true],
    [120_000, true],
    [121_000, false],
  ])(
    'follows the window of activity: written %i ms ago, working is %s — S-48',
    (silence, working) => {
      const session = { ...aTranscriptSession({ lastModified: 0 }), origin: 'external' as const };
      const { activity } = activityOf(session, {
        liveSessionId: null,
        now: silence,
        windowMs: 120_000,
      });

      expect(inferWorking([toolCall], activity)).toBe(working);
    },
  );

  it('is not working in an empty conversation — S-49', () => {
    expect(inferWorking([], 'activeElsewhere')).toBe(false);
  });

  it('follows the entry after a tool call whose result came in the same read — S-50', () => {
    expect(inferWorking([toolCall, toolResult, text], 'activeElsewhere')).toBe(false);
    expect(inferWorking([toolCall, toolResult], 'activeElsewhere')).toBe(true);
  });

  it('reads an answer with text and a tool, or an empty one, as an open turn', () => {
    expect(inferWorking([answer({ type: 'text' }, { type: 'tool_use' })], 'activeElsewhere')).toBe(
      true,
    );
    expect(inferWorking([answer()], 'activeElsewhere')).toBe(true);
    expect(inferWorking([{ id: 'x', events: [] }], 'activeElsewhere')).toBe(true);
    expect(
      inferWorking(
        [answer('not a block' as unknown as Record<string, unknown>)],
        'activeElsewhere',
      ),
    ).toBe(true);
  });
});
