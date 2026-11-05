import { describe, expect, it, vi } from 'vitest';

import type { Envelope } from '@remote-claude/contracts';

import {
  conversationFrom,
  readEvent,
  sessionCostOf,
  SILENT,
  withHistory,
} from '@/features/session/services/conversation-reducer';
import type { Conversation } from '@/features/session/types/live-session';
import { logger } from '@/shared/logging/logger';
import { aToolCall } from '../../../../support/canonical-tool';

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
        completed('m1', [{ type: 'toolUse', toolUseId: 't1' }]),
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

    it('ignores an item that is not a block, and a call drawn as the tool, not the message', () => {
      const state = fold(
        completed('m1', ['text', { type: 'toolUse' }, { type: 'text', text: 'ok' }]),
      );

      expect(state.messages[0]?.blocks).toEqual([{ kind: 'text', text: 'ok' }]);
    });

    it('draws a block of a kind it does not know generically, in its place (U-05)', () => {
      const state = fold(
        completed('m1', [
          { type: 'text', text: 'Before.' },
          { type: 'server_tool_use', text: 'searched the web' },
        ]),
      );

      expect(state.messages[0]?.blocks).toEqual([
        { kind: 'text', text: 'Before.' },
        { kind: 'unknown', text: 'searched the web', blockType: 'server_tool_use' },
      ]);
    });

    it('draws a call and its result as their tool, never as blocks of the message — plan 28, S-88', () => {
      const state = fold(
        completed('m1', [
          { type: 'text', text: 'Looking.' },
          { type: 'toolUse', toolUseId: 't1' },
          { type: 'toolResult', toolUseId: 't1' },
        ]),
      );

      // Drawn as the tool, never as a block of the message — generic or otherwise (plan 28, S-88).
      expect(state.messages[0]?.blocks).toEqual([{ kind: 'text', text: 'Looking.' }]);
    });

    it('keeps the blocks it draws around a kind it does not know — plan 28, S-90', () => {
      const state = fold(
        completed('m1', [
          { type: 'text', text: 'Before.' },
          { type: 'hologram', text: 'unknown' },
          { type: 'text', text: 'After.' },
        ]),
      );

      expect(state.messages[0]).toMatchObject({ isComplete: true, text: 'Before.After.' });
    });

    it(
      'a block of a kind the adapter should always have canonicalised reads generically if it ' +
        "ever isn't — plan 28, B-30, neutral core",
      () => {
        const state = fold(completed('m1', [{ type: 'redacted_thinking' }, { type: 'tool_use' }]));

        expect(state.messages[0]?.blocks).toEqual([
          { kind: 'unknown', text: '', blockType: 'redacted_thinking' },
          { kind: 'unknown', text: '', blockType: 'tool_use' },
        ]);
      },
    );

    it('reads a message with no content as one with no blocks', () => {
      const state = fold(frame('message.completed', { messageId: 'm1', role: 'user' }));

      expect(state.messages[0]).toMatchObject({ role: 'user', blocks: [], text: '' });
    });

    it('ignores a delta with no text, and draws the generic line for a completed message with no id — U-09', () => {
      expect(fold(frame('message.delta', { messageId: 'm1' }))).toBe(SILENT);

      const state = fold(frame('message.completed', { content: [] }));

      expect(state.timeline).toEqual([
        {
          kind: 'notice',
          id: 'malformed:message.completed',
          reason: 'malformed',
          level: 'notice',
          text: null,
          truncated: false,
          parentToolUseId: null,
        },
      ]);
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
      const state = fold(completed('m1', [{ type: 'redactedThinking' }]));

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
        frame('tool.started', { toolUseId: 'a1', ...aToolCall('Agent', {}) }),
        frame('tool.started', {
          toolUseId: 't2',
          ...aToolCall('Read', {}),
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
        frame('tool.started', { toolUseId: 'a1', ...aToolCall('Agent', {}) }),
        frame('tool.started', { toolUseId: 'a2', ...aToolCall('Agent', {}) }),
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
        frame('tool.started', { toolUseId: 't1', ...aToolCall('Bash', { command: 'x' }) }),
        frame('tool.progress', { toolUseId: 't1', chunk: 'Bash · 2s' }),
        frame('tool.progress', { toolUseId: 't1', chunk: 'Bash · 2s' }),
        frame('tool.progress', { toolUseId: 't1', chunk: 'Bash · 3s' }),
      );

      expect(state.tools[0]?.elapsed).toBe('Bash · 3s');
    });

    it('leaves a tool as it was for a progress with no text, or an outcome it does not know', () => {
      const started = fold(frame('tool.started', { toolUseId: 't1', ...aToolCall('Bash') }));
      const after = [
        frame('tool.progress', { toolUseId: 't1' }),
        frame('tool.completed', { toolUseId: 't1', status: 'exploded' }),
        frame('tool.completed', { status: 'failed' }),
      ].reduce(readEvent, started);

      expect(after.tools).toEqual(started.tools);
      expect(started.tools[0]?.rawInput).toEqual({});
    });

    it('reads each attachment kind of a tool.completed — plan 27, F6 · B-22', () => {
      const started = fold(frame('tool.started', { toolUseId: 't1', ...aToolCall('Bash') }));
      const state = readEvent(
        started,
        frame('tool.completed', {
          toolUseId: 't1',
          status: 'succeeded',
          attachments: [
            { kind: 'image', blockId: 'm1:0:0', mediaType: 'image/png', size: 12 },
            { kind: 'link', uri: 'https://example.com', title: 'Example' },
            { kind: 'unknown', type: 'resource' },
            { type: 'noKindAtAll' },
          ],
        }),
      );

      expect(state.tools[0]?.attachments).toEqual([
        { kind: 'image', blockId: 'm1:0:0', mediaType: 'image/png', size: 12 },
        { kind: 'link', uri: 'https://example.com', title: 'Example' },
        { kind: 'unknown', type: 'resource' },
      ]);
    });

    it('a tool.completed with no attachments at all carries none', () => {
      const started = fold(frame('tool.started', { toolUseId: 't1', ...aToolCall('Bash') }));
      const state = readEvent(
        started,
        frame('tool.completed', { toolUseId: 't1', status: 'succeeded' }),
      );

      expect(state.tools[0]?.attachments).toBeUndefined();
    });

    it('starts a tool that is started again once, in the timeline as in the tools', () => {
      const started = frame('tool.started', { toolUseId: 't1', ...aToolCall('Bash', {}) });
      const state = fold(started, started);

      expect(state.tools).toHaveLength(1);
      expect(state.timeline).toEqual([{ kind: 'tool', id: 't1' }]);
    });

    it('draws the generic line for a start with no kind, or with no id — plan 28 B-18, U-09', () => {
      const malformed = [
        {
          kind: 'notice',
          id: 'malformed:tool.started',
          reason: 'malformed',
          level: 'notice',
          text: null,
          truncated: false,
          parentToolUseId: null,
        },
      ];

      expect(fold(frame('tool.started', { toolUseId: 't1' })).timeline).toEqual(malformed);
      expect(fold(frame('tool.started', { ...aToolCall('Bash') })).timeline).toEqual(malformed);
    });

    it('keeps the kind, the label, the subject, the changes and the exact input — plan 28 B-18', () => {
      const call = aToolCall(
        'Edit',
        { file_path: '/w/a.ts', old_string: 'a', new_string: 'b' },
        '/w',
      );
      const state = fold(frame('tool.started', { toolUseId: 't1', ...call, title: '  Fix  ' }));

      expect(state.tools[0]).toMatchObject({ ...call, title: 'Fix', status: 'running' });
    });

    it('starts a tool of a kind it does not know, drawn later as the generic line — plan 28 S-56', () => {
      const state = fold(
        frame('tool.started', {
          toolUseId: 't1',
          kind: 'vcs.commit',
          label: 'not a label',
          subject: null,
          changes: 'none',
          origin: 7,
          rawInput: { message: 'wip' },
        }),
      );

      expect(state.tools[0]).toMatchObject({
        kind: 'vcs.commit',
        label: { messageKey: '', params: {} },
        subject: {},
        changes: [],
        origin: { engine: '', native: '' },
        rawInput: { message: 'wip' },
      });
    });
  });

  describe('turns — B-23', () => {
    it('reads cost, duration and every count of tokens of a turn, in our names — S-97, plan 28 S-85', () => {
      const state = fold(
        frame('turn.completed', {
          turnId: 'turn-1',
          outcome: 'completed',
          costUsd: '0.0123',
          durationMs: 2400,
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            cacheReadTokens: 30,
            cacheWriteTokens: 40,
            reasoningTokens: 5,
            webSearches: 2,
          },
        }),
      );

      expect(state.lastTurn).toEqual({
        turnId: 'turn-1',
        outcome: 'completed',
        costUsd: '0.0123',
        durationMs: 2400,
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 30,
          cacheWriteTokens: 40,
          reasoningTokens: 5,
          webSearches: 2,
        },
      });
      expect(state.timeline).toEqual([{ kind: 'turn', id: 'turn-1' }]);
    });

    it('keeps no tokens for a turn that reported none, and only the counts that came — S-98, S-86', () => {
      const state = fold(
        frame('turn.completed', { turnId: 'a', costUsd: '0', durationMs: 1, usage: {} }),
        frame('turn.completed', {
          turnId: 'b',
          costUsd: '0',
          durationMs: 1,
          usage: { outputTokens: Number.NaN, inputTokens: 7 },
        }),
        frame('turn.completed', { turnId: 'c', durationMs: 1 }),
      );

      expect(state.turns.map((turn) => turn.usage)).toEqual([null, { inputTokens: 7 }, null]);
    });

    it('reads the names of the previous protocol as no count at all — plan 28, B-29', () => {
      const state = fold(
        frame('turn.completed', {
          turnId: 'a',
          costUsd: '0.01',
          durationMs: 1,
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      );

      expect(state.lastTurn?.usage).toBeNull();
    });

    it('keeps a turn with no cost, its cost unknown and not zero — plan 28, S-86', () => {
      const state = fold(
        frame('turn.completed', { turnId: 'a', outcome: 'completed', durationMs: 1, usage: {} }),
      );

      expect(state.lastTurn).toEqual({
        turnId: 'a',
        outcome: 'completed',
        costUsd: null,
        durationMs: 1,
        usage: null,
      });
      expect(state.timeline).toEqual([{ kind: 'turn', id: 'a' }]);
    });

    it('keeps a cost of zero as zero — plan 28, S-87', () => {
      const state = fold(
        frame('turn.completed', { turnId: 'a', costUsd: '0.000000', durationMs: 1, usage: {} }),
      );

      expect(state.lastTurn?.costUsd).toBe('0.000000');
    });

    it('draws the generic line for a turn missing its id or its duration — U-09', () => {
      const malformed = [
        {
          kind: 'notice',
          id: 'malformed:turn.completed',
          reason: 'malformed',
          level: 'notice',
          text: null,
          truncated: false,
          parentToolUseId: null,
        },
      ];

      expect(fold(frame('turn.completed', { durationMs: 1 })).timeline).toEqual(malformed);
      expect(fold(frame('turn.completed', { turnId: 'a', costUsd: '1' })).timeline).toEqual(
        malformed,
      );
    });

    it.each(['limitReached', 'budgetExceeded', 'failed'])(
      "reads the outcome %s, never the engine's own name for it — S-163, plan 27 B-10",
      (outcome) => {
        const state = fold(frame('turn.completed', { turnId: 'a', durationMs: 1, outcome }));

        expect(state.lastTurn?.outcome).toBe(outcome);
      },
    );

    it('reads an outcome this build does not know as failed, never as a silent success', () => {
      const state = fold(
        frame('turn.completed', { turnId: 'a', durationMs: 1, outcome: 'error_during_execution' }),
      );

      expect(state.lastTurn?.outcome).toBe('failed');
    });

    it('reads a turn with no outcome at all as completed — a backend from before this field existed', () => {
      const state = fold(frame('turn.completed', { turnId: 'a', durationMs: 1 }));

      expect(state.lastTurn?.outcome).toBe('completed');
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
        outcome: 'completed' as const,
        costUsd,
        durationMs: 0,
        usage: null,
      }));

      expect(sessionCostOf(turns)).toBe('0.300000');
      expect(sessionCostOf([])).toBe('0.000000');
    });

    it('adds nothing for a turn whose engine reports no cost — plan 28, S-86', () => {
      const turns = ['0.1', null].map((costUsd, index) => ({
        turnId: String(index),
        outcome: 'completed' as const,
        costUsd,
        durationMs: 0,
        usage: null,
      }));

      expect(sessionCostOf(turns)).toBe('0.100000');
    });
  });

  describe('when the turn began — plan 09, B-21', () => {
    const status = (value: string, ts: string): Envelope =>
      frame('session.statusChanged', { status: value }, ts);

    it('takes the instant the status first left rest, and keeps it while the turn moves', () => {
      const state = fold(
        status('thinking', at(0)),
        status('running', at(5)),
        status('waitingPermission', at(9)),
      );

      expect(state.turnSince).toBe(at(0));
      expect(state.status).toBe('waitingPermission');
    });

    it('drops it when the turn is over, and the next turn starts its own', () => {
      const ended = fold(status('thinking', at(0)), status('idle', at(30)));
      expect(ended.turnSince).toBeNull();

      expect(readEvent(ended, status('thinking', at(40))).turnSince).toBe(at(40));
    });

    it('drops it when the session closes mid-turn', () => {
      const state = fold(
        status('running', at(0)),
        frame('session.closed', { reason: 'failed' }, at(3)),
      );

      expect(state.turnSince).toBeNull();
    });

    it('starts no clock from the history, which carries no instant', () => {
      expect(fold(status('thinking', '')).turnSince).toBeNull();
    });

    it('keeps it through a status it cannot read', () => {
      const state = fold(status('thinking', at(0)), status('dreaming', at(2)));

      expect(state).toMatchObject({ status: 'thinking', turnSince: at(0) });
    });
  });

  describe('the files put back — plan 09, B-28', () => {
    it('is a line of the conversation, in its place, with how many went back, stayed and failed', () => {
      const state = fold(
        completed('m1', [{ type: 'text', text: 'Done.' }]),
        frame(
          'session.rewound',
          {
            promptId: 'p1',
            reverted: [
              { path: '/a', action: 'restored' },
              { path: '/b', action: 'deleted' },
            ],
            preserved: [{ path: '/c', reason: 'modifiedOutside' }],
            unchanged: [{ path: '/d' }],
            failed: [],
          },
          T0,
          7,
        ),
      );

      expect(state.timeline).toEqual([
        { kind: 'message', id: 'm1' },
        { kind: 'rewound', id: '7', restored: 2, kept: 1, failed: 0 },
      ]);
    });

    it('counts nothing a list does not carry, and draws the generic line for an undo that names no point — U-09', () => {
      const counted = fold(frame('session.rewound', { promptId: 'p1', reverted: 'all' }));
      expect(counted.timeline).toEqual([
        { kind: 'rewound', id: 'f-session.rewound', restored: 0, kept: 0, failed: 0 },
      ]);

      expect(fold(frame('session.rewound', { reverted: [] })).timeline).toEqual([
        {
          kind: 'notice',
          id: 'malformed:session.rewound',
          reason: 'malformed',
          level: 'notice',
          text: null,
          truncated: false,
          parentToolUseId: null,
        },
      ]);
    });
  });

  describe('compaction', () => {
    it('marks where the conversation was compacted, once per event', () => {
      const compacted = frame('session.compacted', { trigger: 'manual', preTokens: 9000 }, T0, 7);
      const state = fold(compacted, compacted);

      expect(state.timeline).toEqual([
        { kind: 'compacted', id: '7', trigger: 'manual', preTokens: 9000, summary: null },
      ]);
    });

    it('reads a compaction with nothing in it as automatic, keyed by its frame', () => {
      const state = fold(frame('session.compacted', {}));

      expect(state.timeline).toEqual([
        {
          kind: 'compacted',
          id: 'f-session.compacted',
          trigger: 'auto',
          preTokens: null,
          summary: null,
        },
      ]);
    });

    it('keys a compaction by its compactionId when the backend sends one — F3 · B-09, F5 · B-18', () => {
      const state = fold(frame('session.compacted', { trigger: 'manual', compactionId: 'cx1' }));

      expect(state.timeline).toEqual([
        { kind: 'compacted', id: 'cx1', trigger: 'manual', preTokens: null, summary: null },
      ]);
    });

    it(
      "folds a message with injected.kind 'contextSummary' into the compaction it belongs to, " +
        'never as a message bubble — B-21',
      () => {
        const state = fold(
          frame('session.compacted', { trigger: 'auto', compactionId: 'cx1' }),
          completed('s1', [{ type: 'text', text: 'what changed' }], {
            injected: { kind: 'contextSummary' },
          }),
        );

        expect(state.timeline).toEqual([
          {
            kind: 'compacted',
            id: 'cx1',
            trigger: 'auto',
            preTokens: null,
            summary: 'what changed',
          },
        ]);
        expect(state.messages).toEqual([]);
      },
    );

    it(
      "an injected skill body ('instructions') draws its own line, nested under the tool, never " +
        'a message bubble — B-21',
      () => {
        const state = fold(
          completed('s1', [{ type: 'text', text: 'be concise' }], {
            injected: { kind: 'instructions', name: 'pr-reviewer' },
            parentToolUseId: 't1',
          }),
        );

        expect(state.timeline).toEqual([
          {
            kind: 'injected',
            id: 'message:s1',
            injectedKind: 'instructions',
            name: 'pr-reviewer',
            parentToolUseId: 't1',
          },
        ]);
        expect(state.messages).toEqual([]);
      },
    );

    it('a commandExpansion message still shows as the person’s own prompt — B-21', () => {
      const state = fold(
        completed('s1', [{ type: 'text', text: '/review args' }], {
          role: 'user',
          injected: { kind: 'commandExpansion' },
        }),
      );

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toMatchObject({ text: '/review args', role: 'user' });
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

  describe('the identity of a block — plan 22, B-13', () => {
    const thought = (blockId?: string) => ({ type: 'thinking', ...(blockId ? { blockId } : {}) });

    it('keeps two thinkings the model did not show in one answer — S-35', () => {
      const state = fold(completed('m1', [thought('u1:0')]), completed('m1', [thought('u2:0')]));

      expect(state.messages[0]?.blocks).toEqual([
        { kind: 'thinking', text: '', blockId: 'u1:0' },
        { kind: 'thinking', text: '', blockId: 'u2:0' },
      ]);
    });

    it('shows once the block a page and a follower both delivered — S-36', () => {
      const block = [{ type: 'text', blockId: 'u1:0', text: 'Once.' }];
      const page = {
        type: 'message.completed',
        payload: { messageId: 'm1', role: 'assistant', content: block },
      };

      expect(conversationFrom([page, page]).messages[0]?.blocks).toEqual([
        { kind: 'text', text: 'Once.', blockId: 'u1:0' },
      ]);
    });

    it('keeps the old rule for a block with no identity — S-37', () => {
      const state = fold(completed('m1', [thought()]), completed('m1', [thought()]));
      const mixed = fold(
        completed('m1', [{ type: 'text', text: 'Same.' }]),
        completed('m1', [{ type: 'text', blockId: 'u1:0', text: 'Same.' }]),
      );

      expect(state.messages[0]?.blocks).toHaveLength(1);
      expect(mixed.messages[0]?.blocks).toHaveLength(1);
    });

    it('joins a live session with its history by message, nothing doubled or lost — S-38', () => {
      const live = fold(
        completed('m2', [{ type: 'thinking', blockId: 'u3:0' }]),
        completed('m2', [{ type: 'text', blockId: 'u4:0', text: 'live' }]),
      );
      const merged = withHistory(live, [
        {
          type: 'message.completed',
          payload: {
            messageId: 'm1',
            role: 'user',
            content: [{ type: 'text', blockId: 'u1:0', text: 'old' }],
          },
        },
        {
          type: 'message.completed',
          payload: {
            messageId: 'm2',
            role: 'assistant',
            content: [{ type: 'thinking', blockId: 'u3:0' }],
          },
        },
      ]);

      expect(merged.timeline).toEqual([
        { kind: 'message', id: 'm1' },
        { kind: 'message', id: 'm2' },
      ]);
      expect(merged.messages.find((message) => message.messageId === 'm2')?.blocks).toHaveLength(2);
    });

    it('lays new entries of an answer already begun into the same message, in order — S-39', () => {
      const state = conversationFrom([
        {
          type: 'message.completed',
          payload: { messageId: 'm1', role: 'assistant', content: [thought('u1:0')] },
        },
        {
          type: 'message.completed',
          payload: {
            messageId: 'm1',
            role: 'assistant',
            content: [{ type: 'text', blockId: 'u2:0', text: 'A' }],
          },
        },
        {
          type: 'message.completed',
          payload: {
            messageId: 'm1',
            role: 'assistant',
            content: [{ type: 'text', blockId: 'u3:0', text: 'B' }],
          },
        },
      ]);

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.blocks.map((block) => block.blockId)).toEqual([
        'u1:0',
        'u2:0',
        'u3:0',
      ]);
      expect(state.messages[0]?.text).toBe('AB');
    });
  });

  describe('an event without a reader — plan 27, F1 · B-04', () => {
    it('leaves the conversation unchanged for a type the contract classifies silent, and logs it', () => {
      const debug = vi.spyOn(logger, 'debug');

      const state = fold(frame('session.mcpStatusChanged', { servers: [] }));

      expect(state).toEqual(SILENT);
      expect(debug).toHaveBeenCalledWith(
        { op: 'conversation.readEvent', type: 'session.mcpStatusChanged' },
        'silent event, no reader',
      );
    });

    it('draws the generic line for a type this build has never heard of, and logs it differently — U-06', () => {
      const debug = vi.spyOn(logger, 'debug');

      const state = fold(frame('session.inventedByAFutureBuild', {}));

      expect(state.timeline).toEqual([
        {
          kind: 'notice',
          id: 'unknown-event:session.inventedByAFutureBuild',
          reason: 'unknownEvent',
          detail: 'session.inventedByAFutureBuild',
          level: 'notice',
          text: null,
          truncated: false,
          parentToolUseId: null,
        },
      ]);
      expect(debug).toHaveBeenCalledWith(
        { op: 'conversation.readEvent', type: 'session.inventedByAFutureBuild' },
        'unknown event, no reader',
      );
    });

    it('shows the generic line for an unknown type only once per type, ever — U-06, D-02', () => {
      const once = fold(
        frame('session.inventedByAFutureBuild', {}),
        frame('session.inventedByAFutureBuild', {}),
        frame('session.inventedByAFutureBuild', {}),
      );

      expect(once.timeline).toHaveLength(1);
    });

    it('logs an event it does read, distinctly from the two cases above', () => {
      const debug = vi.spyOn(logger, 'debug');

      fold(delta('m1', 'hi'));

      expect(debug).toHaveBeenCalledWith(
        { op: 'conversation.readEvent', type: 'message.delta' },
        'event read',
      );
    });
  });

  describe('session.notice — plan 27, F6 · B-19', () => {
    function noticeFrame(extra: Record<string, unknown> = {}): Envelope {
      return frame('session.notice', {
        noticeId: 'n1',
        kind: 'command.output',
        level: 'info',
        origin: { engine: 'claude', native: 'system:local_command_output' },
        ...extra,
      });
    }

    it('reads every known kind into its own timeline entry, keyed by noticeId, not seq — S-72', () => {
      const state = fold(noticeFrame({ text: 'README.md' }));

      expect(state.timeline).toEqual([
        {
          kind: 'notice',
          id: 'notice:n1',
          noticeKind: 'command.output',
          level: 'info',
          text: 'README.md',
          truncated: false,
          parentToolUseId: null,
        },
      ]);
    });

    it('carries the level the backend sent, whatever it is, defaulting an unknown one to notice — S-73', () => {
      expect(fold(noticeFrame({ level: 'error' })).timeline[0]).toMatchObject({ level: 'error' });
      expect(fold(noticeFrame({ level: 'something-new' })).timeline[0]).toMatchObject({
        level: 'notice',
      });
    });

    it('carries messageKey and params through untranslated — the client translates, not the reducer', () => {
      const state = fold(
        noticeFrame({
          kind: 'model.switched',
          messageKey: 'sessions.notice.modelSwitched',
          params: { from: 'a', to: 'b', reason: 'refusal' },
          text: undefined,
        }),
      );

      expect(state.timeline[0]).toMatchObject({
        messageKey: 'sessions.notice.modelSwitched',
        params: { from: 'a', to: 'b', reason: 'refusal' },
      });
    });

    it('draws by kind alone, never by origin.engine — S-76', () => {
      const claude = fold(noticeFrame({ origin: { engine: 'claude', native: 'x' } }));
      const other = fold(noticeFrame({ origin: { engine: 'other', native: 'y' } }));

      expect(claude.timeline[0]).toMatchObject({ noticeKind: 'command.output' });
      expect(other.timeline[0]).toMatchObject({ noticeKind: 'command.output' });
    });

    it('nests under its subagent by parentToolUseId, same as a tool or a message — S-75', () => {
      const state = fold(noticeFrame({ parentToolUseId: 't1' }));

      expect(state.timeline[0]).toMatchObject({ parentToolUseId: 't1' });
    });

    it('changes nothing without a noticeId — cannot be kept from duplicating on replay', () => {
      expect(fold(noticeFrame({ noticeId: undefined }))).toBe(SILENT);
    });

    it('replaces rather than duplicates the same notice delivered twice — live, replay or history — S-77', () => {
      const state = fold(noticeFrame(), noticeFrame());

      expect(state.timeline).toHaveLength(1);
    });

    it('reads a kind this build has no line for as unknown, with the text if there is one — U-11', () => {
      const state = fold(noticeFrame({ kind: 'a.future.kind', text: 'details' }));

      expect(state.timeline[0]).toMatchObject({
        noticeKind: 'a.future.kind',
        reason: 'unknownNotice',
        text: 'details',
      });
    });

    it('collapses an unknown kind repeated in a row into one line with a counter, but not across a gap — S-86, S-87, D-12', () => {
      const ten = fold(
        ...Array.from({ length: 10 }, (_unused, i) =>
          noticeFrame({ noticeId: `u${i}`, kind: 'unknown', text: 'same' }),
        ),
      );

      expect(ten.timeline).toHaveLength(1);
      expect(ten.timeline[0]).toMatchObject({ count: 10 });

      const interleaved = fold(
        noticeFrame({ noticeId: 'a1', kind: 'unknown', text: 'A' }),
        noticeFrame({ noticeId: 'b1', kind: 'unknown', text: 'B' }),
        noticeFrame({ noticeId: 'a2', kind: 'unknown', text: 'A' }),
      );

      expect(interleaved.timeline).toHaveLength(3);
      expect(interleaved.timeline.every((entry) => !('count' in entry) || entry.count === 1)).toBe(
        true,
      );
    });
  });

  describe('the generic line in place of a known event this build could not use — plan 27, F6 · B-20', () => {
    it('leaves the session status where it was, with a line naming the value — U-07', () => {
      const started = fold(frame('session.statusChanged', { status: 'thinking' }));
      const state = readEvent(
        started,
        frame('session.statusChanged', { status: 'a-future-status' }),
      );

      expect(state.status).toBe('thinking');
      expect(state.timeline).toEqual([
        {
          kind: 'notice',
          id: 'unknown-value:session.statusChanged:status',
          reason: 'unknownValue',
          detail: 'a-future-status',
          level: 'notice',
          text: null,
          truncated: false,
          parentToolUseId: null,
        },
      ]);
    });

    it('leaves a tool where it was, with a line naming the value — U-07', () => {
      const started = fold(frame('tool.started', { toolUseId: 't1', ...aToolCall('Bash') }));
      const state = readEvent(
        started,
        frame('tool.completed', { toolUseId: 't1', status: 'a-future-status' }),
      );

      expect(state.tools[0]?.status).toBe('running');
      expect(state.timeline.map((entry) => entry.kind)).toEqual(['tool', 'notice']);
    });

    it('never closes the session on a reason this build does not recognise, but still says so', () => {
      const state = readEvent(fold(), frame('session.closed', { reason: 'a-future-reason' }));

      expect(state.status).not.toBe('closed');
      expect(state.timeline[0]).toMatchObject({
        reason: 'unknownValue',
        detail: 'a-future-reason',
      });
    });
  });

  describe('turn error and the notice around it — plan 27, F6 · B-23', () => {
    it('a turn that did not complete keeps its timeline entry, drawn in an error state (S-97)', () => {
      const state = fold(
        frame('turn.completed', { turnId: 't1', durationMs: 1, outcome: 'failed' }),
      );

      expect(state.timeline).toEqual([{ kind: 'turn', id: 't1' }]);
      expect(state.turns[0]?.outcome).toBe('failed');
    });

    it('the turn.failed notice lands right after the turn, as its own entry — S-97', () => {
      const state = fold(
        frame('turn.completed', { turnId: 't1', durationMs: 1, outcome: 'failed' }),
        frame('session.notice', {
          noticeId: 'n1',
          kind: 'turn.failed',
          level: 'error',
          origin: { engine: 'claude', native: 'result:error_during_execution' },
          text: 'boom',
        }),
      );

      expect(state.timeline.map((entry) => entry.kind)).toEqual(['turn', 'notice']);
    });

    it('a notice arriving between two deltas of the same message does not split the answer in two — S-101', () => {
      const state = fold(
        delta('m1', 'Hello'),
        frame('session.notice', {
          noticeId: 'n1',
          kind: 'agent.info',
          level: 'info',
          origin: { engine: 'claude', native: 'system:informational' },
          text: 'thinking out loud',
        }),
        delta('m1', ', world'),
      );

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.text).toBe('Hello, world');
      expect(state.timeline.map((entry) => entry.kind)).toEqual(['message', 'notice']);
    });
  });
});
