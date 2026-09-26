import { describe, expect, it } from 'vitest';
import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { historicalEvents, SdkMessageMapper } from '@adapter/outbound/claude/sdk-message.mapper';
import { loadFixture } from '../../../../fakes/agent-sdk/fixture';
import { capturedTranscript } from '../../../../fakes/agent-sdk/scripted-transcripts';

/** A transcript entry of a given shape, cast once here rather than in every case. */
function entry(shape: Record<string, unknown>): SessionMessage {
  return {
    uuid: 'u-1',
    session_id: 's-1',
    parent_tool_use_id: null,
    parent_agent_id: null,
    ...shape,
  } as unknown as SessionMessage;
}

describe('a message read back from history — plan 04, B-03', () => {
  it('becomes exactly the events the live stream produced for it — S-02', () => {
    // The captured run, twice: once as the stream delivered it, once as `getSessionMessages`
    // returns it. One reducer on the client is only possible if the two are the same events.
    const live = loadFixture('tool-turn').messages.filter(
      (message: SDKMessage) => message.type === 'user' || message.type === 'assistant',
    );
    const history = capturedTranscript('tool-turn');

    expect(history).toHaveLength(live.length);

    history.forEach((message, index) => {
      const streamed = new SdkMessageMapper().read(live[index] as SDKMessage).events;

      expect(historicalEvents(message)).toEqual(streamed);
    });
  });

  it('covers every event kind the timeline is made of', () => {
    const types = new Set(
      capturedTranscript('tool-turn').flatMap((message) =>
        historicalEvents(message).map((event) => event.type),
      ),
    );

    expect([...types].sort()).toEqual(['message.completed', 'tool.completed', 'tool.started']);
  });

  it('keys an assistant message on the API`s message id, which the deltas were keyed on', () => {
    const [event] = historicalEvents(
      entry({
        type: 'assistant',
        message: { id: 'msg_1', content: [{ type: 'text', text: 'hi' }] },
      }),
    );

    expect(event?.payload).toMatchObject({ messageId: 'msg_1', role: 'assistant' });
  });

  it('falls back to the entry`s own id when the API message carries none', () => {
    const [event] = historicalEvents(
      entry({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
    );

    expect(event?.payload).toMatchObject({ messageId: 'u-1' });
  });

  it('shows a prompt as a completed user message, keyed on its entry id', () => {
    const [event] = historicalEvents(
      entry({ type: 'user', message: { role: 'user', content: 'continue from here' } }),
    );

    expect(event).toEqual({
      type: 'message.completed',
      payload: {
        messageId: 'u-1',
        role: 'user',
        content: [{ type: 'text', text: 'continue from here' }],
      },
    });
  });

  it('produces nothing for a `system` entry', () => {
    expect(historicalEvents(entry({ type: 'system', message: { subtype: 'x' } }))).toEqual([]);
  });

  it('survives an entry whose message is not an object', () => {
    expect(historicalEvents(entry({ type: 'user', message: null }))).toEqual([
      { type: 'message.completed', payload: { messageId: 'u-1', role: 'user', content: [] } },
    ]);
  });
});
