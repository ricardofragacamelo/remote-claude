import { describe, expect, it } from 'vitest';

import type { Envelope } from '@remote-claude/contracts';

import {
  conversationFrom,
  readEvent,
  sessionCostOf,
  SILENT,
  withHistory,
} from '@/features/session/services/conversation-reducer';
import type { Conversation } from '@/features/session/types/live-session';

const T0 = '2026-09-19T12:00:00.000Z';

function at(seconds: number): string {
  return new Date(Date.parse(T0) + seconds * 1000).toISOString();
}

function frame(type: string, payload: Record<string, unknown>, ts = T0, seq?: number): Envelope {
  return { v: 1, id: `f-${type}`, kind: 'event', type, ts, seq, payload } as Envelope;
}

function fold(...frames: readonly Envelope[]): Conversation {
  return frames.reduce(readEvent, SILENT);
}

function delta(messageId: string, text: string, extra: Record<string, unknown> = {}, ts = T0) {
  return frame('message.delta', { messageId, delta: text, ...extra }, ts);
}

function completed(messageId: string, content: readonly unknown[], extra = {}, ts = T0) {
  return frame('message.completed', { messageId, role: 'assistant', content, ...extra }, ts);
}

/**
 * The panel's reducer (plan 08, F2): blocks of one message, thinking, subagents, turns and the
 * compaction point — the same reducer for the live stream and the history.
 */
describe('the conversation reducer', () => {
  describe('the blocks of a message', () => {
    it('adds each block the CLI finishes under one id, never replacing the text before it', () => {
      const state = fold(
        completed('m1', [{ type: 'text', text: 'Looking.' }]),
        completed('m1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]),
      );

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toMatchObject({ text: 'Looking.', isComplete: true });
    });

    it('does not add a block the history and the stream both delivered', () => {
      const block = [{ type: 'text', text: 'Once.' }];
      const state = fold(completed('m1', block), completed('m1', block));

      expect(state.messages[0]?.blocks).toEqual([{ kind: 'text', text: 'Once.' }]);
    });

    it('streams an answer whose markdown is still open, and settles it when it ends — S-63', () => {
      const open = fold(delta('m1', 'Here:\n```ts\nconst a'));

      expect(open.messages[0]).toMatchObject({
        text: 'Here:\n```ts\nconst a',
        isComplete: false,
        streaming: { kind: 'text' },
      });

      const done = readEvent(
        open,
        completed('m1', [{ type: 'text', text: 'Here:\n```ts\nconst a = 1;\n```' }]),
      );
      expect(done.messages[0]).toMatchObject({
        text: 'Here:\n```ts\nconst a = 1;\n```',
        isComplete: true,
        streaming: null,
      });
    });

    it('ignores a block of a type it does not draw, and an item that is not a block', () => {
      const state = fold(
        completed('m1', ['text', { type: 'image' }, { type: 'text', text: 'ok' }]),
      );

      expect(state.messages[0]?.blocks).toEqual([{ kind: 'text', text: 'ok' }]);
    });

    it('reads a message with no content as one with no blocks', () => {
      const state = fold(frame('message.completed', { messageId: 'm1', role: 'user' }));

      expect(state.messages[0]).toMatchObject({ role: 'user', blocks: [], text: '' });
    });

    it('ignores a delta with no text, and a completed message with no id', () => {
      expect(fold(frame('message.delta', { messageId: 'm1' }))).toBe(SILENT);
      expect(fold(frame('message.completed', { content: [] }))).toBe(SILENT);
    });
  });

  describe('thinking — B-19', () => {
    it('streams thinking as its own block, never into the answer — S-82', () => {
      const state = fold(
        delta('m1', 'Let me think', { blockType: 'thinking' }),
        delta('m1', ' harder', { blockType: 'thinking' }),
      );

      expect(state.messages[0]).toMatchObject({
        text: '',
        streaming: { kind: 'thinking', text: 'Let me think harder' },
        thinkingSince: T0,
        thinkingMs: null,
      });
    });

    it('measures how long it thought, from the first fragment to the first of the answer', () => {
      const state = fold(
        delta('m1', 'hmm', { blockType: 'thinking' }, at(0)),
        delta('m1', 'more', { blockType: 'thinking' }, at(2)),
        delta('m1', 'The answer', {}, at(4)),
        delta('m1', ' is 42', {}, at(9)),
      );

      expect(state.messages[0]).toMatchObject({ thinkingMs: 4000, text: 'The answer is 42' });
    });

    it('measures it when the thinking block finishes, and keeps the first measure', () => {
      const state = fold(
        delta('m1', 'hmm', { blockType: 'thinking' }, at(0)),
        completed('m1', [{ type: 'thinking', thinking: 'hmm' }], {}, at(3)),
        completed('m1', [{ type: 'text', text: 'Done.' }], {}, at(8)),
      );

      expect(state.messages[0]).toMatchObject({
        thinkingMs: 3000,
        blocks: [
          { kind: 'thinking', text: 'hmm' },
          { kind: 'text', text: 'Done.' },
        ],
        text: 'Done.',
      });
    });

    it('keeps no duration for thinking from the history, which has no clock — S-84', () => {
      const state = conversationFrom([
        {
          type: 'message.completed',
          payload: {
            messageId: 'm1',
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Considered it.' },
              { type: 'text', text: 'Answer.' },
            ],
          },
        },
      ]);

      expect(state.messages[0]).toMatchObject({
        thinkingMs: null,
        blocks: [
          { kind: 'thinking', text: 'Considered it.' },
          { kind: 'text', text: 'Answer.' },
        ],
      });
    });

    it('keeps a redacted thinking as a block with nothing in it — S-83', () => {
      const state = fold(completed('m1', [{ type: 'redacted_thinking', data: 'opaque' }]));

      expect(state.messages[0]?.blocks).toEqual([{ kind: 'redactedThinking', text: '' }]);
    });

    it('measures nothing when a frame has no instant', () => {
      const state = fold(
        delta('m1', 'hmm', { blockType: 'thinking' }, at(0)),
        delta('m1', 'answer', {}, 'not a date'),
      );

      expect(state.messages[0]?.thinkingMs).toBeNull();
    });
  });

  describe('subagents — B-21', () => {
    it('keeps the tool and the messages of a subagent under the tool that opened it — S-88', () => {
      const state = fold(
        frame('tool.started', { toolUseId: 'a1', toolName: 'Agent', input: {} }),
        frame('tool.started', {
          toolUseId: 't2',
          toolName: 'Read',
          input: {},
          parentToolUseId: 'a1',
        }),
        delta('s1', 'sub text', { parentToolUseId: 'a1' }),
        completed('s2', [{ type: 'text', text: 'sub done' }], { parentToolUseId: 'a1' }),
      );

      expect(state.tools.map((tool) => [tool.toolUseId, tool.parentToolUseId])).toEqual([
        ['a1', null],
        ['t2', 'a1'],
      ]);
      expect(state.messages.map((message) => message.parentToolUseId)).toEqual(['a1', 'a1']);
    });

    it('never mixes the children of two subagents running at once — S-89', () => {
      const state = fold(
        frame('tool.started', { toolUseId: 'a1', toolName: 'Agent', input: {} }),
        frame('tool.started', { toolUseId: 'a2', toolName: 'Agent', input: {} }),
        delta('x', 'of one', { parentToolUseId: 'a1' }),
        delta('y', 'of two', { parentToolUseId: 'a2' }),
        delta('x', ' still one', { parentToolUseId: 'a1' }),
      );

      expect(state.messages.map((message) => [message.parentToolUseId, message.text])).toEqual([
        ['a1', 'of one still one'],
        ['a2', 'of two'],
      ]);
    });
  });

  describe('tools', () => {
    it('replaces the elapsed time with each progress, never appending to it — S-80', () => {
      const state = fold(
        frame('tool.started', { toolUseId: 't1', toolName: 'Bash', input: { command: 'x' } }),
        frame('tool.progress', { toolUseId: 't1', chunk: 'Bash · 2s' }),
        frame('tool.progress', { toolUseId: 't1', chunk: 'Bash · 2s' }),
        frame('tool.progress', { toolUseId: 't1', chunk: 'Bash · 3s' }),
      );

      expect(state.tools[0]?.elapsed).toBe('Bash · 3s');
    });

    it('leaves a tool as it was for a progress with no text, or an outcome it does not know', () => {
      const started = fold(frame('tool.started', { toolUseId: 't1', toolName: 'Bash' }));
      const after = [
        frame('tool.progress', { toolUseId: 't1' }),
        frame('tool.completed', { toolUseId: 't1', status: 'exploded' }),
        frame('tool.completed', { status: 'failed' }),
      ].reduce(readEvent, started);

      expect(after.tools).toEqual(started.tools);
      expect(started.tools[0]?.input).toEqual({});
    });

    it('starts a tool that is started again once, in the timeline as in the tools', () => {
      const started = frame('tool.started', { toolUseId: 't1', toolName: 'Bash', input: {} });
      const state = fold(started, started);

      expect(state.tools).toHaveLength(1);
      expect(state.timeline).toEqual([{ kind: 'tool', id: 't1' }]);
    });

    it('ignores a start with no name', () => {
      expect(fold(frame('tool.started', { toolUseId: 't1' }))).toBe(SILENT);
    });
  });

  describe('turns — B-23', () => {
    it('reads cost, duration and every count of tokens of a turn — S-97', () => {
      const state = fold(
        frame('turn.completed', {
          turnId: 'turn-1',
          costUsd: '0.0123',
          durationMs: 2400,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 40,
          },
        }),
      );

      expect(state.lastTurn).toEqual({
        turnId: 'turn-1',
        costUsd: '0.0123',
        durationMs: 2400,
        usage: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 },
      });
      expect(state.timeline).toEqual([{ kind: 'turn', id: 'turn-1' }]);
    });

    it('keeps no tokens for a turn that ended without them, and zero for a missing count — S-98', () => {
      const state = fold(
        frame('turn.completed', { turnId: 'a', costUsd: '0', durationMs: 1, usage: {} }),
        frame('turn.completed', {
          turnId: 'b',
          costUsd: '0',
          durationMs: 1,
          usage: { output_tokens: Number.NaN },
        }),
      );

      expect(state.turns.map((turn) => turn.usage)).toEqual([
        null,
        { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      ]);
    });

    it('ignores a turn missing its cost or its duration', () => {
      expect(fold(frame('turn.completed', { turnId: 'a', durationMs: 1 }))).toBe(SILENT);
      expect(fold(frame('turn.completed', { turnId: 'a', costUsd: '1' }))).toBe(SILENT);
    });

    it('counts a turn the replay delivers twice once — S-99', () => {
      const turn = frame('turn.completed', { turnId: 'a', costUsd: '0.1', durationMs: 1 });
      const state = fold(
        turn,
        frame('turn.completed', { turnId: 'b', costUsd: '0.2', durationMs: 1 }),
        turn,
      );

      expect(state.turns.map((each) => each.turnId)).toEqual(['b', 'a']);
      expect(sessionCostOf(state.turns)).toBe('0.300000');
    });

    it('sums in millionths, so the cost of the session never drifts', () => {
      const turns = ['0.1', '0.2', 'not money'].map((costUsd, index) => ({
        turnId: String(index),
        costUsd,
        durationMs: 0,
        usage: null,
      }));

      expect(sessionCostOf(turns)).toBe('0.300000');
      expect(sessionCostOf([])).toBe('0.000000');
    });
  });

  describe('compaction', () => {
    it('marks where the conversation was compacted, once per event', () => {
      const compacted = frame('session.compacted', { trigger: 'manual', preTokens: 9000 }, T0, 7);
      const state = fold(compacted, compacted);

      expect(state.timeline).toEqual([
        { kind: 'compacted', id: '7', trigger: 'manual', preTokens: 9000 },
      ]);
    });

    it('reads a compaction with nothing in it as automatic, keyed by its frame', () => {
      const state = fold(frame('session.compacted', {}));

      expect(state.timeline).toEqual([
        { kind: 'compacted', id: 'f-session.compacted', trigger: 'auto', preTokens: null },
      ]);
    });
  });

  describe('the history underneath', () => {
    it('lays the timeline and the turns of the history under the stream, each once', () => {
      const live = fold(
        frame('turn.completed', { turnId: 'turn-2', costUsd: '0.2', durationMs: 1 }),
        completed('m2', [{ type: 'text', text: 'live' }]),
      );
      const merged = withHistory(live, [
        {
          type: 'message.completed',
          payload: { messageId: 'm1', role: 'user', content: [{ type: 'text', text: 'old' }] },
        },
        { type: 'turn.completed', payload: { turnId: 'turn-1', costUsd: '0.1', durationMs: 1 } },
        { type: 'turn.completed', payload: { turnId: 'turn-2', costUsd: '0.2', durationMs: 1 } },
      ]);

      expect(merged.timeline).toEqual([
        { kind: 'message', id: 'm1' },
        { kind: 'turn', id: 'turn-1' },
        { kind: 'turn', id: 'turn-2' },
        { kind: 'message', id: 'm2' },
      ]);
      expect(merged.turns.map((turn) => turn.turnId)).toEqual(['turn-1', 'turn-2']);
      expect(merged.lastTurn?.turnId).toBe('turn-2');
    });
  });
});
