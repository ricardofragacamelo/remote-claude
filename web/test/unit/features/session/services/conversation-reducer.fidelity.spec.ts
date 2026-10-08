import { describe, expect, it } from 'vitest';

import type { Envelope } from '@remote-claude/contracts';

import {
  conversationFrom,
  readEvent,
  SILENT,
} from '@/features/session/services/conversation-reducer';
import type { HistoryEvent } from '@/features/session/types/history';
import type { Conversation } from '@/features/session/types/live-session';

const T0 = '2026-10-07T12:00:00.000Z';

function at(seconds: number): string {
  return new Date(Date.parse(T0) + seconds * 1000).toISOString();
}

function frame(type: string, payload: Record<string, unknown>, ts = T0): Envelope {
  return { v: 1, id: `f-${type}`, kind: 'event', type, ts, payload } as Envelope;
}

function fold(...frames: readonly Envelope[]): Conversation {
  return frames.reduce(readEvent, SILENT);
}

/** A prompt of the history, written at `when`. */
function prompt(
  messageId: string,
  when?: string,
  content: unknown[] = [{ type: 'text', text: 'Go' }],
): HistoryEvent {
  return {
    type: 'message.completed',
    payload: { messageId, role: 'user', content, ...(when === undefined ? {} : { at: when }) },
  };
}

/** A thinking of the history, the model's only block of its entry, written at `when`. */
function thought(messageId: string, blockId: string, when?: string, text?: string): HistoryEvent {
  return {
    type: 'message.completed',
    payload: {
      messageId,
      role: 'assistant',
      content: [{ type: 'thinking', blockId, ...(text === undefined ? {} : { thinking: text }) }],
      ...(when === undefined ? {} : { at: when }),
    },
  };
}

/** Plan 22, F5 — what the reducer keeps for the conversation to be drawn as the Claude Code draws it. */
describe('the conversation reducer — plan 22, F5', () => {
  describe('the duration of a thinking of the history — B-27, D-14', () => {
    it('is the interval from the entry before to the block, at most — S-104', () => {
      const state = conversationFrom([prompt('p1', at(0)), thought('m1', 'u1:0', at(7))]);

      expect(state.messages[1]?.blocks[0]).toMatchObject({ kind: 'thinking', atMostMs: 7_000 });
      expect(state.writtenAt).toBe(at(7));
    });

    it('is measured from a tool result, when that is the entry before it — S-104', () => {
      const state = conversationFrom([
        {
          type: 'tool.started',
          payload: { toolUseId: 't1', toolName: 'Bash', input: {}, at: at(1) },
        },
        {
          type: 'tool.completed',
          payload: { toolUseId: 't1', status: 'succeeded', summary: 'ok', at: at(4) },
        },
        thought('m1', 'u3:0', at(9.5)),
      ]);

      expect(state.messages[0]?.blocks[0]?.atMostMs).toBe(5_500);
    });

    it('gives two thinkings of one answer each its own bound — S-35, S-104', () => {
      const state = conversationFrom([
        prompt('p1', at(0)),
        thought('m1', 'u1:0', at(2)),
        {
          type: 'tool.started',
          payload: { toolUseId: 't1', toolName: 'Read', input: {}, at: at(2) },
        },
        { type: 'tool.completed', payload: { toolUseId: 't1', status: 'succeeded', at: at(3) } },
        thought('m1', 'u4:0', at(10)),
      ]);

      expect(state.messages[1]?.blocks.map((block) => block.atMostMs)).toEqual([2_000, 7_000]);
    });

    it('is zero for two entries written in the same instant — S-105', () => {
      const state = conversationFrom([prompt('p1', at(0)), thought('m1', 'u1:0', at(0))]);

      expect(state.messages[1]?.blocks[0]?.atMostMs).toBe(0);
    });

    it.each([
      ['the first entry', [thought('m1', 'u1:0', at(3))]],
      ['an entry before it with no instant', [prompt('p1'), thought('m1', 'u1:0', at(3))]],
      ['a block with no instant', [prompt('p1', at(0)), thought('m1', 'u1:0')]],
      ['an instant that is not one', [prompt('p1', 'yesterday'), thought('m1', 'u1:0', at(3))]],
      // A queued prompt is read after a result it predates (S-21): a negative interval is none.
      [
        'a block written before the entry before it',
        [prompt('p1', at(9)), thought('m1', 'u1:0', at(3))],
      ],
    ])('is absent for %s — S-106', (_case, events) => {
      const state = conversationFrom(events);

      expect(state.messages.at(-1)?.blocks[0]).not.toHaveProperty('atMostMs');
    });

    it('bounds no redacted thinking, no text and no image', () => {
      const state = conversationFrom([
        prompt('p1', at(0)),
        {
          type: 'message.completed',
          payload: {
            messageId: 'm1',
            role: 'assistant',
            content: [{ type: 'redacted_thinking' }, { type: 'text', text: 'Done.' }],
            at: at(4),
          },
        },
      ]);

      expect(state.messages[1]?.blocks.every((block) => block.atMostMs === undefined)).toBe(true);
    });

    it('keeps the stream measuring, with no bound, live — S-107', () => {
      const state = fold(
        frame('message.delta', { messageId: 'm1', delta: 'Hm', blockType: 'thinking' }, at(0)),
        frame(
          'message.completed',
          {
            messageId: 'm1',
            role: 'assistant',
            content: [{ type: 'thinking', blockId: 'u1:0', thinking: 'Hm' }],
          },
          at(3),
        ),
      );

      expect(state.messages[0]).toMatchObject({ thinkingMs: 3_000 });
      expect(state.messages[0]?.blocks[0]).not.toHaveProperty('atMostMs');
      expect(state).not.toHaveProperty('writtenAt');
    });

    it('remembers no instant from an event it does not read', () => {
      const state = fold(frame('session.unheardOf', { at: at(5) }));

      expect(state).toBe(SILENT);
    });
  });

  describe('the image of a prompt — B-30, D-09', () => {
    it('keeps the block, with its type and its size, and never any bytes — S-118', () => {
      const state = conversationFrom([
        prompt('p1', at(0), [
          { type: 'text', text: 'Look', blockId: 'p1:0' },
          { type: 'image', blockId: 'p1:1', mediaType: 'image/png', size: 48_213 },
        ]),
      ]);

      expect(state.messages[0]?.blocks).toEqual([
        { kind: 'text', text: 'Look', blockId: 'p1:0' },
        { kind: 'image', text: '', blockId: 'p1:1', mediaType: 'image/png', size: 48_213 },
      ]);
      expect(state.messages[0]?.text).toBe('Look');
    });

    it('keeps a prompt of only an image as a message with its marker — S-121', () => {
      const state = conversationFrom([
        prompt('p1', at(0), [
          { type: 'image', blockId: 'p1:0', mediaType: 'image/jpeg', size: 10 },
        ]),
      ]);

      expect(state.messages[0]).toMatchObject({ role: 'user', text: '' });
      expect(state.messages[0]?.blocks).toHaveLength(1);
      expect(state.timeline).toEqual([{ kind: 'message', id: 'p1' }]);
    });

    it.each([
      ['no size and no type: an image by URL', {}, {}],
      ['a size that is not a number', { size: '12' }, {}],
      ['a negative size', { size: -1 }, {}],
      ['an empty type', { mediaType: '' }, {}],
      ['a size of zero', { size: 0 }, { size: 0 }],
    ])('reads %s defensively — S-19', (_case, fields, kept) => {
      const state = conversationFrom([
        prompt('p1', at(0), [{ type: 'image', blockId: 'p1:0', ...fields }]),
      ]);

      expect(state.messages[0]?.blocks).toEqual([
        { kind: 'image', text: '', blockId: 'p1:0', ...kept },
      ]);
    });

    it('keeps two images of one prompt from an older server apart by what they say', () => {
      const state = fold(
        frame('message.completed', {
          messageId: 'p1',
          role: 'user',
          content: [
            { type: 'image', mediaType: 'image/png', size: 1 },
            { type: 'image', mediaType: 'image/png', size: 2 },
          ],
        }),
        frame('message.completed', {
          messageId: 'p1',
          role: 'user',
          content: [{ type: 'image', mediaType: 'image/png', size: 2 }],
        }),
      );

      expect(state.messages[0]?.blocks.map((block) => block.size)).toEqual([1, 2]);
    });

    it('does not end a thinking the stream is measuring', () => {
      const state = fold(
        frame('message.delta', { messageId: 'm1', delta: 'Hm', blockType: 'thinking' }, at(0)),
        frame(
          'message.completed',
          { messageId: 'm1', role: 'assistant', content: [{ type: 'image' }] },
          at(2),
        ),
      );

      expect(state.messages[0]?.thinkingMs).toBeNull();
    });
  });

  describe('the title of a tool — B-29, D-05', () => {
    it('keeps the description the model gave the call — S-111', () => {
      const state = fold(
        frame('tool.started', {
          toolUseId: 't1',
          toolName: 'Bash',
          input: { command: 'pnpm test' },
          title: '  Run the tests ',
        }),
      );

      expect(state.tools[0]).toMatchObject({ toolName: 'Bash', title: 'Run the tests' });
    });

    it.each([
      ['absent', {}],
      ['empty', { title: '' }],
      ['only spaces', { title: '   ' }],
      ['not text', { title: 7 }],
    ])('keeps none when it is %s — S-111, S-13', (_case, extra) => {
      const state = fold(
        frame('tool.started', { toolUseId: 't1', toolName: 'Bash', input: {}, ...extra }),
      );

      expect(state.tools[0]).not.toHaveProperty('title');
    });
  });
});
