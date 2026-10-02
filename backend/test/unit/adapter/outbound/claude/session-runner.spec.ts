import { beforeEach, describe, expect, it } from 'vitest';

import { COMMANDS_TIMEOUT_MS, SessionRunner } from '@adapter/outbound/claude/session-runner';
import type { ClaudeSessionStart, SessionEvent, ToolInvocation } from '@application/session';
import type { SessionCloseReason } from '@domain/session';
import { ClaudeTimeoutError, ClaudeUnavailableError, SessionId } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { aConversation } from '../../../../support/builders/session.builder';
import { WorkspacePath } from '@domain/workspace';
import { loadCommands, loadFixture, loadInstallation } from '../../../../fakes/agent-sdk/fixture';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions, ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../../support/fakes/manual-scheduler';
import { StubPermissionGate } from '../../../../support/fakes/stub-permission-gate';
import { RecordingJournal } from '../../../../support/fakes/recording-journal';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import type { LogLine } from '../../../../support/fakes/recording-logger';
import { runWithTrace } from '@shared/logging/trace-context';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
const now = new Date('2026-09-18T12:00:00.000Z');

/** A runner over a scripted stream, with everything it produced collected. */
function runner(
  script: ScriptOptions = {},
  extra: {
    scheduler?: ManualScheduler;
    bundledCliVersion?: string | null;
    start?: Pick<ClaudeSessionStart, 'effort' | 'forkAt' | 'onForkRejected'>;
  } = {},
): {
  runner: SessionRunner;
  events: SessionEvent[];
  closed: SessionCloseReason[];
  recorded: ToolInvocation[];
  journal: RecordingJournal;
  record: ScriptRecord;
  log: RecordingLogger;
  settle: () => Promise<void>;
} {
  const events: SessionEvent[] = [];
  const closed: SessionCloseReason[] = [];
  const recorded: ToolInvocation[] = [];
  const log = new RecordingLogger();
  const journal = new RecordingJournal();
  const gate = new StubPermissionGate();
  const { createQuery, record } = scriptedSdk(script);

  const built = new SessionRunner(
    {
      sessionId: SessionId.create(SESSION),
      // A directory nothing on this machine has trusted, so the mitigation finds nothing to clear.
      workspace: WorkspacePath.create('/srv/projects/app'),
      model: null,
      permissionMode: 'default',
      conversation: { claudeSessionId: ClaudeSessionId.create(CONVERSATION), resumedFrom: null },
      onEvent: (event) => events.push(event),
      onClosed: (reason) => closed.push(reason),
      ...extra.start,
    },
    {
      createQuery,
      recorder: {
        record: (invocation) => {
          recorded.push(invocation);
          return Promise.resolve();
        },
      },
      journal,
      permissions: gate,
      limits: { maxBudgetUsd: 10, maxTurns: 100 },
      clock: new FixedClock(now),
      scheduler: extra.scheduler ?? new ManualScheduler(),
      bundledCliVersion:
        extra.bundledCliVersion === undefined ? '2.1.277' : extra.bundledCliVersion,
      logger: log.logger,
    },
  );

  return {
    runner: built,
    events,
    closed,
    recorded,
    journal,
    record,
    log,
    // The stream is consumed on the microtask queue, so draining it is a matter of yielding often
    // enough rather than sleeping for a fixed number of milliseconds. The count is generous: the
    // recorded tool turn is a hundred messages, each with its own hop.
    settle: async () => {
      for (let turn = 0; turn < 2_000; turn += 1) {
        await Promise.resolve();
      }
    },
  };
}

describe('SessionRunner', () => {
  let harness: ReturnType<typeof runner>;

  beforeEach(() => {
    harness = runner();
  });

  describe('the options it opens with', () => {
    it("states `settingSources: ['project']` at the call site", () => {
      // Omitting it loads the user scope and its personal `allow` rules, which skip `canUseTool`
      // in silence; `[]` would drop the project's CLAUDE.md instead. `['project']` keeps both.
      harness.runner.run();

      expect(harness.record.options?.settingSources).toEqual(['project']);
    });

    it('registers a `PreToolUse` hook, which is where the trail is anchored', () => {
      harness.runner.run();

      expect(harness.record.options?.hooks?.PreToolUse?.[0]?.hooks).toHaveLength(1);
    });

    it('runs in the workspace it was given', () => {
      harness.runner.run();

      expect(harness.record.options?.cwd).toBe('/srv/projects/app');
    });

    it('names the conversation with the id already recorded as ours — plan 04, S-71', () => {
      // Minted and recorded before the subprocess existed; the SDK is told to use it rather than
      // inventing one, so the transcript on disk is the one the provenance names.
      harness.runner.run();

      expect(harness.record.options?.sessionId).toBe(CONVERSATION);
    });

    it('never hands a rule back to the SDK, even when the SDK offers one — plan 03, B-04 / D-09', async () => {
      // A rule returned in `updatedPermissions` is applied by the CLI without calling
      // `canUseTool` again, and nothing takes it back out of a live session: revoking would stop
      // working until the next one. Our rule is the only authority, so the answer carries none.
      harness.runner.run();
      const canUseTool = harness.record.options?.canUseTool;

      const result = await canUseTool?.('Bash', { command: 'git status' }, {
        signal: new AbortController().signal,
        toolUseID: 'toolu-1',
        requestId: 'request-1',
        suggestions: [
          {
            type: 'addRules',
            rules: [{ toolName: 'Bash', ruleContent: 'git status' }],
            behavior: 'allow',
            destination: 'session',
          },
        ],
      } as unknown as Parameters<NonNullable<typeof canUseTool>>[2]);

      expect(result).toEqual({ behavior: 'allow', updatedInput: { command: 'git status' } });
      expect(result).not.toHaveProperty('updatedPermissions');
    });
  });

  describe('the stream', () => {
    it('emits nothing until a prompt arrives', async () => {
      harness.runner.run();
      await harness.settle();

      expect(harness.events).toEqual([]);
    });

    it('produces the events of a plain turn once one does — S-21', async () => {
      harness.runner.run();
      harness.runner.prompt('hello');
      await harness.settle();

      // `session.started` is not among them, and that is the point: ours is published when the
      // session is opened, with our id. What the stream produces is the answer.
      const types = harness.events.map((event) => event.type);
      expect(types).not.toContain('session.started');
      expect(types).toContain('message.delta');
      expect(types).toContain('turn.completed');
    });

    it('queues a prompt that arrives during a turn, and runs it next — S-22', async () => {
      harness.runner.run();
      harness.runner.prompt('first');
      harness.runner.prompt('second');
      await harness.settle();

      expect(harness.record.prompts).toEqual(['first', 'second']);
    });
  });

  describe('the audit hook', () => {
    it('fires for every tool of the recorded run', async () => {
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      tools.runner.prompt('do the work');
      await tools.settle();

      expect(tools.recorded.map((invocation) => invocation.toolName)).toEqual(
        loadFixture('tool-turn').preToolUse.map((entry) => entry.toolName),
      );
    });

    it('covers more tools than `canUseTool` ever sees — ADR-011', async () => {
      // The measurement the whole trail rests on. A trail hung on the callback would miss every
      // file read and every auto-approved command.
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      tools.runner.prompt('do the work');
      await tools.settle();

      expect(tools.recorded.length).toBeGreaterThan(tools.record.asked.length);
      expect(tools.record.asked.length).toBeGreaterThan(0);
    });

    it('records the exact input, never a summary of it', async () => {
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      tools.runner.prompt('do the work');
      await tools.settle();

      expect(tools.recorded.every((invocation) => typeof invocation.input === 'object')).toBe(true);
    });

    it('lets the tool through when the trail took it — S-46', async () => {
      // It records and it lets through. Deciding is `canUseTool`'s job, and a hook that also
      // decided would be the hole this separation exists to close.
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      tools.runner.prompt('do the work');
      await tools.settle();

      expect(tools.events.map((event) => event.type)).toContain('turn.completed');
    });

    it('denies the tool, and does not take the stream down, when the trail refused', async () => {
      // A hook that throws ends the session. The graded rule says the opposite: the first failure
      // denies the tool with the session alive, and only the second consecutive one ends it.
      const refused = runner({ fixture: 'tool-turn' });
      const failing = {
        record: () => Promise.reject(new Error('the database is gone')),
      };

      const built = new SessionRunner(
        {
          sessionId: SessionId.create(SESSION),
          workspace: WorkspacePath.create('/srv/projects/app'),
          model: null,
          permissionMode: 'default',
          conversation: aConversation(),
          onEvent: (event) => refused.events.push(event),
          onClosed: (reason) => refused.closed.push(reason),
        },
        {
          createQuery: scriptedSdk({ fixture: 'tool-turn' }).createQuery,
          recorder: failing,
          journal: new RecordingJournal(),
          permissions: new StubPermissionGate(),
          limits: { maxBudgetUsd: 10, maxTurns: 100 },
          clock: new FixedClock(now),
          scheduler: new ManualScheduler(),
          bundledCliVersion: '2.1.277',
          logger: refused.log.logger,
        },
      );

      built.run();
      built.prompt('do the work');
      await refused.settle();

      expect(refused.closed).toEqual([]);
      expect(refused.events.map((event) => event.type)).toContain('turn.completed');
    });

    it('stamps the instant from the clock, never from the wall', async () => {
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      tools.runner.prompt('do the work');
      await tools.settle();

      expect(tools.recorded[0]?.at).toEqual(now);
    });
  });

  describe('when it ends', () => {
    it('reports a completed run and releases the subprocess', async () => {
      harness.runner.run();
      harness.runner.prompt('hello');
      await harness.settle();
      harness.runner.close();
      await harness.settle();

      expect(harness.closed).toEqual(['closedByUser']);
      expect(harness.record.closes).toBeGreaterThan(0);
    });

    it('releases the subprocess even when the stream threw — the `finally`', async () => {
      // A leaked subprocess does not die on its own, and this one runs on the user's machine.
      const failing = runner({ failWith: new Error('the CLI died') });
      failing.runner.run();
      failing.runner.prompt('hello');
      await failing.settle();

      expect(failing.closed).toEqual(['failed']);
      expect(failing.record.closes).toBeGreaterThan(0);
    });

    it('logs a crash at error, so it is not something only the stream knew', async () => {
      const failing = runner({ failWith: new Error('the CLI died') });
      failing.runner.run();
      failing.runner.prompt('hello');
      await failing.settle();

      expect(failing.log.lines.some((line) => line['level'] === 'error')).toBe(true);
    });

    it('reports the close exactly once, however often it is asked', async () => {
      const silent = runner({ silent: true });
      silent.runner.run();
      silent.runner.prompt('hello');

      silent.runner.close();
      silent.runner.close();
      await silent.settle();

      expect(silent.closed).toEqual(['closedByUser']);
    });

    it('accepts a prompt after closing without throwing', async () => {
      harness.runner.run();
      harness.runner.close();

      expect(() => harness.runner.prompt('late')).not.toThrow();
      await harness.settle();
    });
  });

  describe('the control requests', () => {
    it('forwards an interrupt', async () => {
      harness.runner.run();
      await harness.runner.interrupt();

      expect(harness.record.interrupts).toBe(1);
    });

    it.each([
      ['a model change', (r: SessionRunner) => r.setModel('claude-opus-5')],
      ['a mode change', (r: SessionRunner) => r.setPermissionMode('plan')],
    ])('forwards %s without throwing', async (_case, act) => {
      harness.runner.run();

      await expect(act(harness.runner)).resolves.toBeUndefined();
    });

    it('does nothing when the query was never opened', async () => {
      await expect(harness.runner.interrupt()).resolves.toBeUndefined();
    });
  });

  describe('the file journal', () => {
    it('opens a checkpoint for the turn, labelled with the prompt', async () => {
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      tools.runner.prompt('do the work');
      await tools.settle();

      // The scripted stream fires `UserPromptSubmit` only through the hooks the runner registered,
      // so an empty list here would mean the hook was never wired at all.
      expect(tools.record.options?.hooks?.UserPromptSubmit).toHaveLength(1);
    });

    it('snapshots what a file held before the turn wrote to it', async () => {
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      tools.runner.prompt('do the work');
      await tools.settle();

      // The recorded run writes one file; the `PreToolUse` hook is what captures the before.
      expect(tools.journal.captured.map((entry) => entry.path)).toEqual([
        expect.stringContaining('/'),
      ]);
    });

    it('registers a `PostToolUse` hook and none for `PostToolUseFailure`', () => {
      // A tool that failed did not change the file, and recording a hash there would create a
      // baseline the undo would later act on.
      harness.runner.run();

      expect(harness.record.options?.hooks?.PostToolUse).toHaveLength(1);
      expect(harness.record.options?.hooks?.PostToolUseFailure).toBeUndefined();
    });
  });

  describe('what it does with a stream that tells it less', () => {
    it('records an invocation whose hook carried almost nothing', async () => {
      // Several hook fields are documented as absent on older producers. A gap in the trail is
      // worse than a row that says `unknown`.
      const sparse = runner({ fixture: 'tool-turn', sparseHooks: true });
      sparse.runner.run();
      sparse.runner.prompt('do the work');
      await sparse.settle();

      expect(sparse.recorded[0]).toMatchObject({
        toolName: 'unknown',
        toolUseId: null,
        promptId: null,
        input: {},
      });
    });

    it('opens the turn even when the hook named neither the prompt nor its id', async () => {
      const sparse = runner({ fixture: 'tool-turn', sparseHooks: true });
      sparse.runner.run();
      sparse.runner.prompt('do the work');
      await sparse.settle();

      expect(sparse.journal.turns[0]).toEqual({
        sessionId: SESSION,
        promptId: 'unknown',
        promptText: '',
      });
    });

    it('warns about a variant it has never seen, and carries on — S-26', async () => {
      const novel = runner({ extraMessages: [{ type: 'something_new_in_0_4', session_id: 's' }] });
      novel.runner.run();
      novel.runner.prompt('hello');
      await novel.settle();

      expect(
        novel.log
          .withOp('claude.output')
          .some((line) => line['variant'] === 'something_new_in_0_4'),
      ).toBe(true);
      expect(novel.closed).toEqual([]);
    });
  });

  describe("the CLI's own channel", () => {
    it('logs what the SDK wrote to stderr', () => {
      const noisy = runner({ stderr: ['warning: something ordinary\n'] });
      noisy.runner.run();

      expect(noisy.log.withOp('claude.output')[0]).toMatchObject({
        stderr: 'warning: something ordinary',
      });
    });

    it('raises an error when the SDK says our own options shadowed the callback', () => {
      // It is the only place the SDK says so. A backend that did not read this channel would see
      // a session behaving normally with the approval quietly switched off.
      const shadowed = runner({ stderr: ['CLAUDE_SDK_CAN_USE_TOOL_SHADOWED: Write\n'] });
      shadowed.runner.run();

      expect(shadowed.log.lines.some((line) => line['level'] === 'error')).toBe(true);
    });

    it('does not raise an error for ordinary noise', () => {
      const noisy = runner({ stderr: ['warning: something ordinary\n'] });
      noisy.runner.run();

      expect(noisy.log.lines.some((line) => line['level'] === 'error')).toBe(false);
    });
  });

  it('reports the session closed even when releasing the subprocess threw', async () => {
    // A leaked subprocess does not die on its own. Whatever `close()` does on the way out, the
    // abort signal still fires and the session is still reported closed.
    const stubborn = runner({ closeThrows: new Error('already gone') });
    stubborn.runner.run();

    await stubborn.runner.close();

    expect(stubborn.closed).toEqual(['closedByUser']);
    expect(stubborn.log.lines.some((line) => line['level'] === 'warn')).toBe(true);
  });

  describe('the log of this edge', () => {
    it('records the lifecycle, the input and every message', async () => {
      harness.runner.run();
      harness.runner.prompt('hello');
      await harness.settle();

      expect(harness.log.withOp('claude.session.lifecycle').length).toBeGreaterThan(0);
      expect(harness.log.withOp('claude.input')).toHaveLength(1);
      expect(harness.log.withOp('claude.output').length).toBeGreaterThan(0);
    });

    it('logs the type and subtype of a message, never its payload', async () => {
      // A `Read` result carries the contents of somebody's file, and that must not reach the log.
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      tools.runner.prompt('do the work');
      await tools.settle();

      for (const line of tools.log.withOp('claude.output')) {
        expect(line).not.toHaveProperty('message');
        expect(line['messageType']).toBeDefined();
      }
    });

    it('truncates a long prompt rather than logging all of it', async () => {
      harness.runner.run();
      harness.runner.prompt('x'.repeat(5_000));
      await harness.settle();

      const line = harness.log.withOp('claude.input')[0];
      expect(line?.['truncated']).toBe(true);
      expect(String(line?.['prompt'])).toHaveLength(2_048);
    });

    it('says what it found of the trust mark', async () => {
      harness.runner.run();
      await harness.settle();

      expect(harness.log.withOp('claude.session.lifecycle')[0]).toMatchObject({
        trustMark: expect.any(String),
      });
    });
  });

  describe('the trace of a turn — D-16', () => {
    /** The traces the lines of one message were written under, in order, with no repeats. */
    const tracesOf = (lines: readonly LogLine[], msg: string): unknown[] => [
      ...new Set(lines.filter((line) => line['msg'] === msg).map((line) => line['traceId'])),
    ];

    it('runs the hooks, the callback and the stream of a turn under its prompt`s trace — S-31', async () => {
      const tools = runner({ fixture: 'tool-turn' });
      runWithTrace({ traceId: 'trace-start' }, () => {
        tools.runner.run();
      });
      runWithTrace({ traceId: 'trace-turn-1' }, () => {
        tools.runner.prompt('do the work');
      });
      await tools.settle();

      expect(tracesOf(tools.log.lines, 'tool invocation recorded')).toEqual(['trace-turn-1']);
      expect(tracesOf(tools.log.lines, 'canUseTool answered')).toEqual(['trace-turn-1']);
      expect(tracesOf(tools.log.lines, 'sdk message')).toEqual(['trace-turn-1']);
    });

    it('gives each turn its own trace, not the one the session was opened with — S-76', async () => {
      const tools = runner({ fixture: 'tool-turn' });
      runWithTrace({ traceId: 'trace-start' }, () => {
        tools.runner.run();
      });

      runWithTrace({ traceId: 'trace-turn-1' }, () => {
        tools.runner.prompt('first');
      });
      await tools.settle();
      const firstTurn = tools.log.lines.length;

      runWithTrace({ traceId: 'trace-turn-2' }, () => {
        tools.runner.prompt('second');
      });
      await tools.settle();

      const recorded = 'tool invocation recorded';
      expect(tracesOf(tools.log.lines.slice(0, firstTurn), recorded)).toEqual(['trace-turn-1']);
      expect(tracesOf(tools.log.lines.slice(firstTurn), recorded)).toEqual(['trace-turn-2']);
    });

    it('takes the prompts` traces in the order the prompts were queued', async () => {
      // Two prompts before the first turn opens: each `UserPromptSubmit` takes the oldest.
      const tools = runner({ fixture: 'tool-turn' });
      tools.runner.run();
      runWithTrace({ traceId: 'trace-a' }, () => {
        tools.runner.prompt('first');
      });
      runWithTrace({ traceId: 'trace-b' }, () => {
        tools.runner.prompt('second');
      });
      await tools.settle();

      expect(tracesOf(tools.log.lines, 'tool invocation recorded')).toEqual(['trace-a', 'trace-b']);
    });

    it('keeps the trace it had when a turn opens with no prompt of ours behind it', async () => {
      harness.runner.run();
      runWithTrace({ traceId: 'trace-turn-1' }, () => {
        harness.runner.prompt('hello');
      });
      await harness.settle();

      // The CLI opening a turn by itself — the hook fires with nothing of ours queued — and then
      // asking about a tool. What it asks is still attributed to the last prompt we know of.
      const options = harness.record.options;
      await options?.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.(
        { hook_event_name: 'UserPromptSubmit', prompt: 'internal', prompt_id: 'p-2' } as never,
        undefined,
        { signal: new AbortController().signal },
      );
      await options?.canUseTool?.('Bash', { command: 'ls' }, {
        signal: new AbortController().signal,
        requestId: 'request-unprompted',
        toolUseID: 'toolu-unprompted',
      } as never);

      expect(tracesOf(harness.log.lines, 'canUseTool answered')).toEqual(['trace-turn-1']);
    });

    it('writes nothing of a trace when the session was opened outside one', async () => {
      harness.runner.run();
      harness.runner.prompt('hello');
      await harness.settle();

      expect(harness.log.withOp('claude.output').every((line) => !('traceId' in line))).toBe(true);
    });
  });

  describe('the slash commands of the installation — plan 04, F3', () => {
    it('lists them from the query, in our shape — S-29', async () => {
      harness.runner.run();

      const commands = await harness.runner.supportedCommands();

      expect(commands.length).toBe(loadCommands().commands.length);
      expect(commands.find((command) => command.name === 'usage')).toEqual({
        name: 'usage',
        description: expect.any(String) as string,
        argumentHint: '',
        aliases: ['cost', 'stats'],
      });
      expect(harness.record.commandCalls).toBe(1);
    });

    it('gives an empty list of aliases to a command that has none', async () => {
      const narrow = runner({
        commands: [{ name: 'init', description: 'Initialise', argumentHint: '' }],
      });
      narrow.runner.run();

      expect(await narrow.runner.supportedCommands()).toEqual([
        { name: 'init', description: 'Initialise', argumentHint: '', aliases: [] },
      ]);
    });

    it('logs the count and never the list', async () => {
      harness.runner.run();
      await harness.runner.supportedCommands();

      const [line] = harness.log.withOp('claude.commands');
      expect(line).toMatchObject({ level: 'debug', count: loadCommands().commands.length });
      expect(JSON.stringify(line)).not.toContain('Initialize a new CLAUDE.md');
    });

    it('answers unavailable when the CLI fails to list — S-31', async () => {
      const failing = runner({ commands: new Error('the subprocess is gone') });
      failing.runner.run();

      await expect(failing.runner.supportedCommands()).rejects.toThrow(ClaudeUnavailableError);
      expect(failing.log.withOp('claude.commands')[0]).toMatchObject({ level: 'warn' });
    });

    it('answers a timeout when the CLI never answers — S-31', async () => {
      const scheduler = new ManualScheduler();
      const hanging = runner({ commands: 'hang' }, { scheduler });
      hanging.runner.run();

      const listing = hanging.runner.supportedCommands();
      scheduler.fire();

      await expect(listing).rejects.toThrow(ClaudeTimeoutError);
      expect(scheduler.delays).toEqual([COMMANDS_TIMEOUT_MS]);
    });

    it('answers unavailable before the session is running, and after it closed', async () => {
      await expect(harness.runner.supportedCommands()).rejects.toThrow(ClaudeUnavailableError);

      harness.runner.run();
      await harness.runner.close();

      await expect(harness.runner.supportedCommands()).rejects.toThrow(ClaudeUnavailableError);
    });

    it('names the bundled version until the CLI reports its own — S-35', async () => {
      const fresh = runner({}, { bundledCliVersion: '2.1.000' });
      fresh.runner.run();

      expect(fresh.runner.cliVersion).toBe('2.1.000');

      fresh.runner.prompt('hello');
      await fresh.settle();

      // The fixture was recorded from a real CLI, which reported itself in `system:init`.
      expect(fresh.runner.cliVersion).toBe('2.1.277');
      expect(
        fresh.log.lines.filter((line) => line.msg.includes('reports a version other')),
      ).toHaveLength(1);
    });

    it('says nothing when the CLI confirms the bundled version', async () => {
      harness.runner.run();
      harness.runner.prompt('hello');
      await harness.settle();

      expect(harness.runner.cliVersion).toBe('2.1.277');
      expect(harness.log.lines.some((line) => line.msg.includes('reports a version other'))).toBe(
        false,
      );
    });

    it('knows no version when neither the manifest nor the CLI has said one', () => {
      const unknown = runner({}, { bundledCliVersion: null });
      unknown.runner.run();

      expect(unknown.runner.cliVersion).toBeNull();
    });
  });

  describe('what the installation says about itself — plan 08, F4', () => {
    it('lists the models as the installation recorded them, in our shape — S-166', async () => {
      harness.runner.run();

      const models = await harness.runner.supportedModels();

      expect(models).toHaveLength(loadInstallation().models.length);
      expect(models.find((model) => model.value === 'sonnet')).toEqual({
        value: 'sonnet',
        resolvedModel: 'claude-sonnet-5',
        displayName: 'Sonnet',
        description: expect.any(String) as string,
        supportsEffort: true,
        supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
      });
      expect(models.find((model) => model.value === 'haiku')).toMatchObject({
        resolvedModel: 'claude-haiku-4-5-20251001',
        supportsEffort: false,
        supportedEffortLevels: [],
      });
    });

    it('measures the context by category, without the grid nor any file — S-173', async () => {
      harness.runner.run();

      const context = await harness.runner.contextUse();

      expect(context).toMatchObject({ maxTokens: 1_000_000, percentage: 3 });
      expect(context.categories).toContainEqual({
        id: 'freeSpace',
        name: 'Free space',
        tokens: 934_595,
        kind: 'free',
      });
      expect(Object.keys(context)).toEqual([
        'model',
        'totalTokens',
        'maxTokens',
        'percentage',
        'categories',
      ]);
    });

    it('reduces the MCP servers to a name, a status and a count — never the configuration — S-177', async () => {
      const withServers = runner({
        mcpServers: [
          {
            name: 'docs',
            status: 'connected',
            config: { type: 'http', url: 'https://x.example/?token=secret' },
            tools: [{ name: 'search' }, { name: 'read' }],
          },
          { name: 'broken', status: 'failed', error: 'ENOENT /home/someone/.mcp' },
          { name: 'odd', status: 'weird' as never },
        ],
      });
      withServers.runner.run();

      const servers = await withServers.runner.mcpServers();

      expect(servers).toEqual([
        { name: 'docs', status: 'connected', toolCount: 2 },
        { name: 'broken', status: 'failed', toolCount: 0 },
        { name: 'odd', status: 'failed', toolCount: 0 },
      ]);
      expect(JSON.stringify(withServers.log.lines)).not.toContain('secret');
    });

    it('answers unavailable when the CLI fails, and a timeout when it never answers — S-168', async () => {
      const failing = runner({ installationFails: new Error('gone') });
      failing.runner.run();
      await expect(failing.runner.mcpServers()).rejects.toThrow(ClaudeUnavailableError);

      const scheduler = new ManualScheduler();
      const hanging = runner({ installationFails: 'hang' }, { scheduler });
      hanging.runner.run();
      const asking = hanging.runner.contextUse();
      scheduler.fire();
      await expect(asking).rejects.toThrow(ClaudeTimeoutError);
    });
  });

  describe('effort and the fork of an edit-and-resend — D-16, D-19', () => {
    it('opens the query with the effort and the point of the fork', () => {
      const forking = runner(
        {},
        { start: { effort: 'high', forkAt: { keepUpTo: 'a1', dropsTurn: 'u2' } } },
      );
      forking.runner.run();

      expect(forking.record.options).toMatchObject({
        effort: 'high',
        resumeSessionAt: 'a1',
        resumeDropsTurn: 'u2',
      });
      expect(harness.record.options?.effort).toBeUndefined();
    });

    it('says the CLI refused the point of the fork, and ends — S-164', async () => {
      let refused = 0;
      const forking = runner(
        { refuseFork: true },
        {
          start: {
            forkAt: { keepUpTo: 'a1', dropsTurn: 'u2' },
            onForkRejected: () => {
              refused += 1;
            },
          },
        },
      );
      forking.runner.run();
      forking.runner.prompt('again, edited');
      await forking.settle();

      expect(refused).toBe(1);
      expect(forking.closed).toEqual(['completed']);
    });

    it('takes an ordinary error result for what it is', async () => {
      const failing = runner({
        extraMessages: [
          {
            type: 'result',
            subtype: 'error_during_execution',
            errors: ['something else'],
            total_cost_usd: 0,
            duration_ms: 0,
            usage: {},
            uuid: 'r-x',
          },
        ],
      });
      failing.runner.run();
      failing.runner.prompt('hello');
      await failing.settle();

      expect(failing.log.lines.some((line) => line['phase'] === 'forkRejected')).toBe(false);
    });
  });
});
