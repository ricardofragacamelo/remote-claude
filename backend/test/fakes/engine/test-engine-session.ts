import type {
  AgentSessionHandle,
  AgentSessionStart,
  EngineControl,
  JournalScope,
  SessionEvent,
  SessionFileJournal,
  SessionPermissionGate,
  ToolInvocationRecorder,
} from '@application/session';
import { canonicalToolPayload } from '@application/session';
import { pathsChangedBy } from '@domain/engine';
import type { CanonicalTool } from '@domain/engine';
import type { Clock } from '@domain/shared';
import type { Logger } from '@shared/logging/logger';
import { TEST_CAPABILITIES } from './test-capabilities';
import { TEST_ENGINE, TEST_ENGINE_VERSION } from './test-engine';
import type { ScriptedStep, TestEngineScript } from './script';
import { turnFor } from './script';
import { classifyTestTool } from './test-tool-classifier';

/** What one session of the test engine needs — the same generic ports Claude's adapter uses. */
export interface TestEngineSessionDeps {
  readonly permissions: SessionPermissionGate;
  readonly recorder: ToolInvocationRecorder;
  readonly journal: SessionFileJournal;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** One prompt, waiting to be replayed. */
interface QueuedPrompt {
  readonly promptId: string;
  readonly text: string;
}

const LOG_FIELDS = { engine: TEST_ENGINE, layer: 'adapter' } as const;

/**
 * One session of the test engine, replaying scripted turns (plan 28, B-43).
 *
 * It is a fake, built the same way `SessionRunner` is real: there is no subprocess and no external
 * wire format, but a tool call genuinely waits on {@link SessionPermissionGate}, is genuinely
 * recorded by {@link ToolInvocationRecorder} first, and a prompt sent while a turn is running
 * genuinely queues rather than running out of order (`promptWhileBusy`). What it does *not* do is
 * perform a `write_file` on real disk — this fake proves the port's lifecycle contract, not
 * cross-engine disk I/O, which the existing Claude-only file-change suites already cover.
 *
 * **Nothing is emitted until a prompt arrives** — the same rule `scripted-query.ts` calls out for
 * the real SDK's own fake: a session that streamed before anybody asked anything would hide every
 * ordering bug there is.
 */
export class TestEngineSession implements AgentSessionHandle {
  readonly capabilities = TEST_CAPABILITIES;

  /** Every control this engine has: none — every capability gating one is off (`test-capabilities.ts`). */
  readonly control: EngineControl = {};

  readonly cliVersion = TEST_ENGINE_VERSION;

  private readonly queued: QueuedPrompt[] = [];
  private pumping = false;
  private closed = false;

  private mintedPrompts = 0;
  private completedTurns = 0;
  private toolCalls = 0;
  private completedMessages = 0;

  /** Released by `interrupt()`, for a turn that was scripted to hold until somebody stops it. */
  private holdRelease: (() => void) | null = null;

  private readonly abort = new AbortController();

  constructor(
    private readonly start: AgentSessionStart,
    private readonly deps: TestEngineSessionDeps,
    private readonly script: TestEngineScript,
    private readonly defaultTurn: string,
  ) {}

  prompt(promptText: string): string {
    this.mintedPrompts += 1;
    const promptId = `test-prompt-${String(this.mintedPrompts)}`;

    this.deps.logger.debug(
      { ...LOG_FIELDS, op: 'engine.input', sessionId: this.start.sessionId.value, promptId },
      'prompt queued',
    );

    // Pushed even once the session is closed and dropped there: a prompt that raced the close is
    // not an error the person can do anything about, the same leniency `SessionInputQueue.push`
    // gives a push after `close()`.
    if (this.closed) {
      return promptId;
    }

    this.queued.push({ promptId, text: promptText });
    if (!this.pumping) {
      void this.pump();
    }

    return promptId;
  }

  /** Runs every queued turn, in order, one at a time — a prompt sent while this runs is queued. */
  private async pump(): Promise<void> {
    this.pumping = true;

    try {
      for (;;) {
        if (this.closed) {
          return;
        }

        const next = this.queued.shift();
        if (next === undefined) {
          return;
        }

        try {
          await this.runTurn(next.promptId, next.text);
        } catch (error) {
          // The survival rule, the same one Claude's own mapper carries for a message variant it
          // does not know (`sdk-message.mapper.ts`): a script that names a turn nobody wrote costs a
          // log line, never the whole session — and the queue goes on to whatever was asked next.
          this.deps.logger.error(
            {
              ...LOG_FIELDS,
              op: 'engine.session.lifecycle',
              sessionId: this.start.sessionId.value,
              err: error,
            },
            'a scripted turn could not be read — dropped',
          );
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runTurn(promptId: string, promptText: string): Promise<void> {
    this.completedTurns += 1;
    const turnId = `test-turn-${String(this.completedTurns)}`;
    const scripted = turnFor(this.script, promptText, this.defaultTurn);

    for (const step of scripted.steps) {
      if (this.closed) {
        return;
      }

      if (step.kind === 'text') {
        this.emitText(step.text);
        continue;
      }

      // The audit trail refusing a tool stops the turn's remaining steps — the same shape Claude's
      // own `PreToolUse` refusal takes (`session-runner.ts`'s `auditHook`): without a trail there is
      // no authorisation, so nothing past it runs.
      const recorded = await this.runToolStep(promptId, step);
      if (!recorded) {
        break;
      }
    }

    if (scripted.holds && !this.closed) {
      // Mirrors `[hold]` of the scripted SDK fake exactly: every step plays normally, and only the
      // turn's own completion — its very last message, there too — waits for `session.interrupt`.
      // A held turn that ran no step would never reach `permission.requested`, and the two engines'
      // "the turn is stuck" would stop reading the same way to the port contract suite.
      await new Promise<void>((resolve) => {
        this.holdRelease = resolve;
      });
      this.holdRelease = null;
    }

    if (!this.closed) {
      this.emitTurnCompleted(turnId);
    }
  }

  /** Runs one tool step: audited first, then gated, then reported — in that order, always. */
  private async runToolStep(
    promptId: string,
    step: Extract<ScriptedStep, { kind: 'tool' }>,
  ): Promise<boolean> {
    this.toolCalls += 1;
    const toolUseId = `test-tool-${String(this.toolCalls)}`;
    const tool: CanonicalTool = classifyTestTool(step.name, step.input, this.start.workspace.value);

    try {
      await this.deps.recorder.record({
        sessionId: this.start.sessionId,
        toolUseId,
        toolName: step.name,
        input: step.input,
        tool,
        promptId,
        at: this.deps.clock.now(),
      });
    } catch (error) {
      this.deps.logger.error(
        {
          ...LOG_FIELDS,
          op: 'engine.permission.request',
          sessionId: this.start.sessionId.value,
          toolName: step.name,
          err: error,
        },
        'the tool is refused because it could not be recorded',
      );
      return false;
    }

    for (const path of pathsChangedBy(tool)) {
      await this.deps.journal.captureBefore(this.journalScope(), promptId, path);
    }

    this.start.onEvent({
      type: 'tool.started',
      payload: { toolUseId, ...canonicalToolPayload(tool, step.input) },
    } as SessionEvent);

    const verdict = await this.deps.permissions.ask({
      sessionId: this.start.sessionId,
      requestId: `test-request-${String(this.toolCalls)}`,
      toolUseId,
      toolName: step.name,
      input: step.input,
      tool,
      signal: this.abort.signal,
    });

    this.deps.logger.debug(
      {
        ...LOG_FIELDS,
        op: 'engine.permission.request',
        sessionId: this.start.sessionId.value,
        toolUseId,
        decision: verdict.decision,
      },
      'the gate answered',
    );

    if (verdict.decision === 'allow') {
      for (const path of pathsChangedBy(tool)) {
        await this.deps.journal.recordResult(this.journalScope(), path);
      }
    }

    this.start.onEvent({
      type: 'tool.completed',
      payload: {
        toolUseId,
        status: verdict.decision === 'allow' ? 'succeeded' : 'denied',
        summary: verdict.decision === 'allow' ? (step.summary ?? '') : (verdict.reason ?? ''),
      },
    } as SessionEvent);

    return true;
  }

  private emitText(value: string): void {
    this.completedMessages += 1;
    this.start.onEvent({
      type: 'message.completed',
      payload: {
        messageId: `test-message-${String(this.completedMessages)}`,
        role: 'assistant',
        content: [{ type: 'text', text: value }],
      },
    } as SessionEvent);
  }

  private emitTurnCompleted(turnId: string): void {
    this.start.onEvent({
      type: 'turn.completed',
      payload: { turnId, usage: {}, durationMs: 0 },
    } as SessionEvent);
  }

  private journalScope(): JournalScope {
    return { sessionId: this.start.sessionId, conversation: this.start.conversation.ref };
  }

  /**
   * Ends whatever turn is held, as the real engine's `interrupt()` ends whatever tool is running.
   *
   * A no-op when nothing is held — a session that was simply idle, or a turn that had already
   * finished on its own, interrupts the same way a real one does: safely, and without starting
   * anything that was not already running.
   */
  interrupt(): Promise<void> {
    const release = this.holdRelease;
    this.holdRelease = null;
    release?.();
    return Promise.resolve();
  }

  /** A no-op: this fake never itself branches on the mode — the gate does (`test-capabilities.ts`). */
  setPermissionMode(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Ends the session. Safe to call twice, from a command and from the shutdown hook at once — the
   * same guarantee `SessionRunner.close()` gives.
   */
  close(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }

    this.closed = true;

    const release = this.holdRelease;
    this.holdRelease = null;
    release?.();

    // Before the abort, so a question left pending is settled by the module that owns it rather
    // than only by the signal — the same ordering `SessionRunner.finish()` keeps.
    this.deps.permissions.forget(this.start.sessionId);
    this.abort.abort();

    this.deps.logger.debug(
      { ...LOG_FIELDS, op: 'engine.session.lifecycle', sessionId: this.start.sessionId.value },
      'test engine session closed',
    );

    this.start.onClosed('closedByUser');
    return Promise.resolve();
  }
}
