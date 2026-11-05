import { describe, expect, it } from 'vitest';
import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import {
  historicalEvents,
  SdkMessageMapper,
} from '@adapter/outbound/engines/claude/sdk-message.mapper';
import { loadFixture } from '../../../../../fakes/agent-sdk/fixture';
import { capturedTranscript } from '../../../../../fakes/agent-sdk/scripted-transcripts';

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
      const streamed = new SdkMessageMapper('').read(live[index] as SDKMessage).events;

      expect(historicalEvents(message, new SdkMessageMapper(''))).toEqual(streamed);
    });
  });

  it('covers every event kind the timeline is made of', () => {
    const mapper = new SdkMessageMapper('');
    const types = new Set(
      capturedTranscript('tool-turn').flatMap((message) =>
        historicalEvents(message, mapper).map((event) => event.type),
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
      new SdkMessageMapper(''),
    );

    expect(event?.payload).toMatchObject({ messageId: 'msg_1', role: 'assistant' });
  });

  it('falls back to the entry`s own id when the API message carries none', () => {
    const [event] = historicalEvents(
      entry({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
      new SdkMessageMapper(''),
    );

    expect(event?.payload).toMatchObject({ messageId: 'u-1' });
  });

  it('shows a prompt as a completed user message, keyed on its entry id', () => {
    const [event] = historicalEvents(
      entry({ type: 'user', message: { role: 'user', content: 'continue from here' } }),
      new SdkMessageMapper(''),
    );

    expect(event).toEqual({
      type: 'message.completed',
      payload: {
        messageId: 'u-1',
        role: 'user',
        content: [{ type: 'text', blockId: 'u-1:0', text: 'continue from here' }],
      },
    });
  });

  it('survives an entry whose message is not an object', () => {
    expect(
      historicalEvents(entry({ type: 'user', message: null }), new SdkMessageMapper('')),
    ).toEqual([
      { type: 'message.completed', payload: { messageId: 'u-1', role: 'user', content: [] } },
    ]);
  });

  describe('a `system` entry — plan 27, F5, B-17 (U-03)', () => {
    it('becomes the compaction boundary when it carries no subtype at all — measured, B-01', () => {
      const [event] = historicalEvents(entry({ type: 'system' }), new SdkMessageMapper(''));

      expect(event).toEqual({
        type: 'session.compacted',
        payload: { trigger: 'manual', compactionId: 'u-1' },
      });
    });

    it('primes the synthetic summary that follows it, the same as the live compact_boundary', () => {
      const mapper = new SdkMessageMapper('');
      historicalEvents(entry({ type: 'system' }), mapper);

      const [event] = historicalEvents(
        entry({
          uuid: 'u-2',
          type: 'user',
          message: { role: 'user', content: 'the summary text' },
          isCompactSummary: true,
          is_meta: true,
        }),
        mapper,
      );

      expect(event?.payload).toMatchObject({ injected: { kind: 'contextSummary' } });
    });

    it('never produces nothing — a subtype never measured in history still becomes `unknown`', () => {
      const [event] = historicalEvents(
        entry({ type: 'system', subtype: 'never_measured' }),
        new SdkMessageMapper(''),
      );

      expect(event?.type).toBe('session.notice');
      expect(event?.payload).toMatchObject({ kind: 'unknown' });
    });

    it('carries the entry`s own `at` on the notice it becomes — S-71', () => {
      const [event] = historicalEvents(
        entry({ type: 'system', subtype: 'never_measured', timestamp: '2026-11-02T22:00:00.000Z' }),
        new SdkMessageMapper(''),
      );

      expect(event?.payload).toMatchObject({ at: '2026-11-02T22:00:00.000Z' });
    });
  });

  describe('the expansion tag of a `/command` — plan 27, F5, B-17', () => {
    it('becomes the typed prompt, tags stripped, args included', () => {
      const [event] = historicalEvents(
        entry({
          type: 'user',
          message: {
            role: 'user',
            content:
              '<command-message>greet</command-message>\n<command-name>/greet</command-name>\n<command-args>world</command-args>',
          },
        }),
        new SdkMessageMapper(''),
      );

      expect(event?.payload).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: '/greet world' }],
      });
    });

    it('a built-in command with no args keeps the flag `isCompletedLocalCommand` out of the way', () => {
      const [event] = historicalEvents(
        entry({
          type: 'user',
          message: {
            role: 'user',
            content:
              '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>',
          },
          isCompletedLocalCommand: true,
        }),
        new SdkMessageMapper(''),
      );

      expect(event?.payload).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: '/compact' }],
      });
    });
  });

  describe('the `<local-command-stdout>` echo — plan 27, F5, B-17', () => {
    it('becomes the `command.output` notice, tag stripped — D-07', () => {
      const [event] = historicalEvents(
        entry({
          type: 'user',
          message: {
            role: 'user',
            content: '<local-command-stdout>Compacted </local-command-stdout>',
          },
          isCompletedLocalCommand: true,
        }),
        new SdkMessageMapper(''),
      );

      expect(event).toMatchObject({ type: 'session.notice', payload: { kind: 'command.output' } });
    });
  });

  describe('a denied tool — plan 27, F5, B-17 (scope gap, as-built)', () => {
    it('shows as an ordinary failure: no `system` entry marks it in history', () => {
      const [event] = historicalEvents(
        entry({
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                is_error: true,
                content: 'Permission to use Bash with command touch forbidden.txt has been denied.',
              },
            ],
          },
        }),
        new SdkMessageMapper(''),
      );

      expect(event).toMatchObject({ type: 'tool.completed', payload: { status: 'failed' } });
    });
  });

  describe('the compaction chain read back — plan 27, F5, B-18 (S-68…S-71)', () => {
    /**
     * A conversation's history exactly as `getSessionMessages` was measured to give it back after a
     * `/compact` (F5, B-01 extended): the bare placeholder, the synthetic summary out of
     * chronological order, the preserved tail, then the typed `/compact` and its stdout echo — both
     * sharing `isCompletedLocalCommand`, told apart only by which tag their content carries.
     */
    const chain = (): readonly SessionMessage[] => [
      entry({ uuid: 'boundary-1', type: 'system' }),
      entry({
        uuid: 'summary-1',
        type: 'user',
        message: { role: 'user', content: 'the summary text' },
        isCompactSummary: true,
        is_meta: true,
      }),
      entry({
        uuid: 'tail-1',
        type: 'assistant',
        message: { id: 'msg_1', content: [{ type: 'text', text: 'done' }] },
      }),
      entry({
        uuid: 'echo-tag-1',
        type: 'user',
        message: {
          role: 'user',
          content:
            '<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>',
        },
        isCompletedLocalCommand: true,
      }),
      entry({
        uuid: 'echo-stdout-1',
        type: 'user',
        message: {
          role: 'user',
          content: '<local-command-stdout>Compacted </local-command-stdout>',
        },
        isCompletedLocalCommand: true,
      }),
    ];

    it('lands the compaction, the summary, the tail and the echo in the same places live did — S-69', () => {
      const mapper = new SdkMessageMapper('');
      const events = chain().flatMap((message) => historicalEvents(message, mapper));

      expect(events.map((event) => event.type)).toEqual([
        'session.compacted',
        'message.completed', // the context summary
        'message.completed', // the preserved tail's answer
        'message.completed', // the typed "/compact" prompt
        'session.notice', // the command.output echo
      ]);
    });

    it('gives the compaction a stable id, the compact_boundary`s own uuid — S-68', () => {
      const mapper = new SdkMessageMapper('');
      const [compacted] = historicalEvents(chain()[0] as SessionMessage, mapper);

      expect(compacted?.payload).toMatchObject({ compactionId: 'boundary-1' });
    });

    it('tells two compactions of the same conversation apart by distinct ids — S-68', () => {
      const mapper = new SdkMessageMapper('');
      const twice = [
        ...chain(),
        entry({ uuid: 'boundary-2', type: 'system' }),
        entry({
          uuid: 'summary-2',
          type: 'user',
          message: { role: 'user', content: 'a second summary' },
          isCompactSummary: true,
          is_meta: true,
        }),
      ].flatMap((message) => historicalEvents(message, mapper));

      const compactions = twice.filter((event) => event.type === 'session.compacted');

      expect(compactions.map((event) => event.payload['compactionId'])).toEqual([
        'boundary-1',
        'boundary-2',
      ]);
    });

    it('reads the same chain twice to the same compactionId and noticeId — never doubled, S-70', () => {
      const read = () => {
        const mapper = new SdkMessageMapper('');
        return chain().flatMap((message) => historicalEvents(message, mapper));
      };

      expect(read()).toEqual(read());
    });

    it('keeps the summary and the preserved tail apart from each other — S-69', () => {
      const mapper = new SdkMessageMapper('');
      const [, summary, tail] = chain().flatMap((message) => historicalEvents(message, mapper));

      expect(summary?.payload).toMatchObject({ injected: { kind: 'contextSummary' } });
      expect(tail?.payload).not.toHaveProperty('injected');
    });
  });
});
