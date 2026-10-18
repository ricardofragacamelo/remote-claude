import { beforeEach, describe, expect, it } from 'vitest';

import type { AgentSessionStart, SessionEvent, ToolInvocation } from '@application/session';
import type { SessionCloseReason } from '@domain/session';
import { SessionId } from '@domain/session';
import { ConversationRef } from '@domain/engine';
import { WorkspacePath } from '@domain/workspace';
import { TestEngineSession } from '../../../fakes/engine/test-engine-session';
import { TEST_SCRIPTS, textStep, turn } from '../../../fakes/engine/script';
import type { TestEngineScript } from '../../../fakes/engine/script';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { RecordingJournal } from '../../../support/fakes/recording-journal';
import { RecordingLogger } from '../../../support/fakes/recording-logger';
import { StubPermissionGate } from '../../../support/fakes/stub-permission-gate';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const CONVERSATION = 'a4b6a5f1-9c35-4b6b-9f1e-9a0b6f1c2d3e';
const now = new Date('2026-10-16T12:00:00.000Z');

/** A session of the test engine, over a chosen script, with everything it produced collected. */
function session(
  script: TestEngineScript = TEST_SCRIPTS,
  defaultTurn = 'text-turn',
  recorder: { record: (invocation: ToolInvocation) => Promise<void> } | null = null,
): {
  session: TestEngineSession;
  events: SessionEvent[];
  closed: SessionCloseReason[];
  recorded: ToolInvocation[];
  journal: RecordingJournal;
  gate: StubPermissionGate;
  log: RecordingLogger;
  settle: () => Promise<void>;
} {
  const events: SessionEvent[] = [];
  const closed: SessionCloseReason[] = [];
  const recorded: ToolInvocation[] = [];
  const journal = new RecordingJournal();
  const gate = new StubPermissionGate();
  const log = new RecordingLogger();

  const start: AgentSessionStart = {
    sessionId: SessionId.create(SESSION),
    workspace: WorkspacePath.create('/srv/projects/app'),
    model: null,
    permissionMode: 'ask',
    conversation: { ref: ConversationRef.create('test', CONVERSATION), resumedFrom: null },
    onEvent: (event) => events.push(event),
    onClosed: (reason) => closed.push(reason),
  };

  const built = new TestEngineSession(
    start,
    {
      permissions: gate,
      recorder: recorder ?? {
        record: (invocation) => Promise.resolve(void recorded.push(invocation)),
      },
      journal,
      clock: new FixedClock(now),
      logger: log.logger,
    },
    script,
    defaultTurn,
  );

  return {
    session: built,
    events,
    closed,
    recorded,
    journal,
    gate,
    log,
    // Every step is driven on the microtask queue (no real timers), so draining it is a matter of
    // yielding often enough rather than sleeping for a fixed number of milliseconds.
    settle: async () => {
      for (let tick = 0; tick < 200; tick += 1) {
        await Promise.resolve();
      }
    },
  };
}

/** The types of [events], in order — what most assertions below read. */
function typesOf(events: readonly SessionEvent[]): string[] {
  return events.map((event) => event.type);
}

/**
 * Scenario matrix (AGENTS.md rule 4) for `TestEngineSession` — the fake's own lifecycle, at the
 * rigor `session-runner.spec.ts` holds Claude's `SessionRunner` to.
 *
 * - equivalência: a scripted tool turn runs audit → gate → `tool.started` → `tool.completed` →
 *   `message.completed` → `turn.completed`, in that order; a question turn carries its
 *   `interaction`; nothing is emitted before the first prompt arrives.
 * - fronteira: a turn with no tool step never touches the recorder or the gate at all.
 * - erro: the recorder refusing a tool stops that turn's remaining steps without crashing the
 *   session; the gate denying a tool still lets the turn finish, with a `denied` status; a script
 *   that names no turn for what was asked is logged and dropped, not thrown into the open.
 * - transição de estado: a prompt sent while a turn holds queues rather than running out of order
 *   (`promptWhileBusy`); `interrupt()` ends a held turn and the session moves on to the next queued
 *   prompt.
 * - concorrência: two prompts queued before the first is taken still run one at a time, each with
 *   its own `toolUseId`/`turnId`, never interleaved.
 * - idempotência: `close()` twice only closes once; `interrupt()` with nothing held is a safe no-op.
 */
describe('TestEngineSession', () => {
  let harness: ReturnType<typeof session>;

  beforeEach(() => {
    harness = session();
  });

  it('emits nothing before the first prompt arrives', () => {
    expect(harness.events).toEqual([]);
    expect(harness.gate.asked).toEqual([]);
    expect(harness.recorded).toEqual([]);
  });

  describe('a scripted tool turn — equivalência', () => {
    it('audits before it asks, asks before it reports, and completes the turn in order', async () => {
      harness.session.prompt('[fixture:tool-turn] do it');
      await harness.settle();

      expect(typesOf(harness.events)).toEqual([
        'tool.started',
        'tool.completed',
        'message.completed',
        'turn.completed',
      ]);
      expect(harness.recorded).toHaveLength(1);
      expect(harness.recorded[0]).toMatchObject({
        toolName: 'write_file',
        tool: { kind: 'file.write' },
      });
      expect(harness.gate.tools).toEqual(['write_file']);

      const started = harness.events[0];
      const completed = harness.events[1];
      expect(started?.type).toBe('tool.started');
      expect(completed?.type).toBe('tool.completed');
      if (started?.type === 'tool.started' && completed?.type === 'tool.completed') {
        expect(completed.payload.toolUseId).toBe(started.payload.toolUseId);
        expect(completed.payload.status).toBe('succeeded');
      }

      expect(harness.journal.captured).toHaveLength(1);
      expect(harness.journal.results).toHaveLength(1);
    });

    it('carries the normalised interaction of a question turn on its tool.started', async () => {
      harness.session.prompt('[fixture:question-turn] ask');
      await harness.settle();

      const started = harness.events.find((event) => event.type === 'tool.started');
      expect(started?.type === 'tool.started' && started.payload.interaction).toMatchObject({
        kind: 'question',
        questions: [{ header: 'Which?' }],
      });
    });
  });

  describe('a turn with no tool step — fronteira', () => {
    it('never touches the recorder nor the gate', async () => {
      harness.session.prompt('[fixture:text-turn] hello');
      await harness.settle();

      expect(typesOf(harness.events)).toEqual(['message.completed', 'turn.completed']);
      expect(harness.recorded).toEqual([]);
      expect(harness.gate.asked).toEqual([]);
    });
  });

  describe('the recorder refusing a tool — erro', () => {
    it('stops the turn before tool.started, and the turn still completes', async () => {
      const refusing = session(TEST_SCRIPTS, 'text-turn', {
        record: () => Promise.reject(new Error('audit store is down')),
      });

      refusing.session.prompt('[fixture:tool-turn] do it');
      await refusing.settle();

      expect(typesOf(refusing.events)).toEqual(['turn.completed']);
      expect(refusing.gate.asked).toEqual([]);
    });
  });

  describe('the gate denying a tool — erro', () => {
    it('still finishes the turn, with the tool reported denied', async () => {
      harness.gate.answer({ decision: 'deny', reason: 'not now', answers: null });
      harness.session.prompt('[fixture:tool-turn] do it');
      await harness.settle();

      expect(typesOf(harness.events)).toEqual([
        'tool.started',
        'tool.completed',
        'message.completed',
        'turn.completed',
      ]);
      const completed = harness.events[1];
      expect(completed?.type === 'tool.completed' && completed.payload).toMatchObject({
        status: 'denied',
        summary: 'not now',
      });
      // A denied tool never ran: nothing records what it would have left on disk.
      expect(harness.journal.results).toEqual([]);
    });
  });

  describe('a script with no turn for what was asked — erro', () => {
    it('logs it and drops the turn, rather than throwing into the open', async () => {
      const empty = session({});

      empty.session.prompt('[fixture:nope] x');
      await empty.settle();

      expect(empty.events).toEqual([]);
      expect(empty.log.withOp('engine.session.lifecycle')).toMatchObject([{ level: 'error' }]);
    });

    it('still runs a prompt queued after the unreadable one', async () => {
      // No `text-turn` here: the default the untagged first prompt asks for does not exist either,
      // so it is the one that is dropped — proving the drop is about the lookup, not the tag.
      const partial = session({ 'tool-turn': turn([textStep('fallback')]) });

      partial.session.prompt('an untagged prompt, asking for the default that is not here');
      partial.session.prompt('[fixture:tool-turn] this one is');
      await partial.settle();

      expect(typesOf(partial.events)).toEqual(['message.completed', 'turn.completed']);
    });
  });

  describe('a prompt sent while a turn holds — transição de estado, promptWhileBusy', () => {
    it('queues rather than running out of order, and interrupt ends the held turn', async () => {
      harness.session.prompt('[fixture:held-turn] hold');
      await harness.settle();
      // Its one step ran — exactly as `[hold]` lets everything but the scripted SDK fake's very
      // last message through — and only its own completion is missing.
      expect(typesOf(harness.events)).toEqual(['message.completed']);

      harness.session.prompt('[fixture:text-turn] then this');
      await harness.settle();
      // Still nothing more: the second prompt is queued, not run ahead of the held one.
      expect(typesOf(harness.events)).toEqual(['message.completed']);

      await harness.session.interrupt();
      await harness.settle();

      expect(typesOf(harness.events)).toEqual([
        'message.completed',
        'turn.completed',
        'message.completed',
        'turn.completed',
      ]);
    });
  });

  describe('two prompts queued before the first is taken — concorrência', () => {
    it('runs them one at a time, each with its own ids, never interleaved', async () => {
      harness.session.prompt('[fixture:tool-turn] one');
      harness.session.prompt('[fixture:shell-turn] two');
      await harness.settle();

      const toolUseIds = harness.events
        .filter((event) => event.type === 'tool.started')
        .map((event) => (event.type === 'tool.started' ? event.payload.toolUseId : null));
      expect(new Set(toolUseIds).size).toBe(2);

      const turnIds = harness.events
        .filter((event) => event.type === 'turn.completed')
        .map((event) => (event.type === 'turn.completed' ? event.payload.turnId : null));
      expect(turnIds).toEqual(['test-turn-1', 'test-turn-2']);
      expect(harness.recorded.map((invocation) => invocation.toolName)).toEqual([
        'write_file',
        'run_shell',
      ]);
    });
  });

  describe('close() — idempotência', () => {
    it('is safe to call twice, and only closes once', async () => {
      await harness.session.close();
      await harness.session.close();

      expect(harness.closed).toEqual(['closedByUser']);
      expect(harness.gate.forgotten).toEqual([SESSION]);
    });
  });

  describe('interrupt() with nothing held — idempotência', () => {
    it('is a safe no-op', async () => {
      await expect(harness.session.interrupt()).resolves.toBeUndefined();
      expect(harness.events).toEqual([]);
    });
  });

  it('declares no control beyond the core — every capability gating one is off', () => {
    expect(harness.session.control).toEqual({});
  });

  it('builds its own turn when given one directly, without a named script', async () => {
    const custom = session({ 'text-turn': turn([textStep('custom reply')]) });
    custom.session.prompt('no tag here');
    await custom.settle();

    const completed = custom.events.find((event) => event.type === 'message.completed');
    expect(completed?.type === 'message.completed' && completed.payload.content).toEqual([
      { type: 'text', text: 'custom reply' },
    ]);
  });
});
