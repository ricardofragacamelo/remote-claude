import type {
  CanUseTool,
  HookJSONOutput,
  Options,
  PermissionMode as SdkPermissionMode,
  PermissionResult,
  Query,
  SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

import type {
  ClaudeSessionHandle,
  ClaudeSessionStart,
  SessionFileJournal,
  SessionPermissionGate,
  ToolInvocationRecorder,
} from '@application/session';
import type { Clock } from '@domain/shared';
import type { PermissionMode, SessionCloseReason } from '@domain/session';
import type { Logger } from '@shared/logging/logger';
import { currentTraceId, runWithTrace } from '@shared/logging/trace-context';
import { pathsWrittenBy } from './file-tools';
import { SessionInputQueue } from './input-queue';
import type { QueryFactory } from './query.factory';
import { buildSdkOptions } from './sdk-options.factory';
import type { SessionLimits } from './sdk-options.factory';
import { SdkMessageMapper } from './sdk-message.mapper';
import { clearTrustMark } from './trusted-directory';

/** How much of a prompt reaches the log. It can carry a secret, so it is cut, never redacted away. */
const PROMPT_LOG_LIMIT = 2_048;

/** What a runner needs besides the start request itself. */
export interface SessionRunnerDeps {
  readonly createQuery: QueryFactory;
  readonly recorder: ToolInvocationRecorder;
  readonly journal: SessionFileJournal;

  /** Who asks the human. `canUseTool` is this port, and the session stops until it answers. */
  readonly permissions: SessionPermissionGate;
  readonly limits: SessionLimits;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * One session, one `query()`, one subprocess.
 *
 * Two rules hold this class together, and both were bought with a spike.
 *
 * **There is exactly one consumer of the `Query`, for the whole life of the session.** Leaving the
 * `for await` early — a `return` on the `result` message, say — aborts the query, and the next call
 * fails with `Operation aborted`. So the loop runs once, here, and nothing else iterates it.
 *
 * **`close()` runs in the `finally`, including when the loop threw.** A leaked subprocess does not
 * die on its own, and this one runs on the machine of whoever installed the product.
 *
 * See docs/architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos.
 */
export class SessionRunner implements ClaudeSessionHandle {
  private readonly queue = new SessionInputQueue();

  // One per session, because it has to remember which message the fragments now arriving belong
  // to — a `content_block_delta` does not say, and only the `message_start` before it does.
  private readonly mapper = new SdkMessageMapper();
  private readonly abort = new AbortController();
  private query: Query | null = null;
  private closed = false;

  /**
   * The trace of each prompt queued and not yet begun, oldest first.
   *
   * The SDK runs its whole loop in the async context of whoever opened the session, so without
   * this every hook of a two-day session would carry the `traceId` of its `session.start` — and one
   * trace per session is the `sessionId`'s job, not the trace's
   * ([D-16](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
   */
  private readonly pendingTraces: (string | null)[] = [];

  /** The trace the current turn runs under: the prompt's, once the CLI says the turn began. */
  private turnTrace: string | null = null;

  constructor(
    private readonly start: ClaudeSessionStart,
    private readonly deps: SessionRunnerDeps,
  ) {}

  /**
   * Opens the subprocess and starts consuming it.
   *
   * It resolves as soon as the stream is running, not when the session ends: the caller gets a
   * handle to drive, and the events arrive through the callbacks.
   */
  run(): void {
    const sessionId = this.start.sessionId.value;
    const directory = this.start.workspace.value;

    // Until the first turn begins, what runs does so because the session was opened.
    this.turnTrace = currentTraceId();

    // Before anything is spawned. In a trusted directory the SDK skips `canUseTool` entirely —
    // measured — so a session opened without this step has no human approval at all.
    const clearance = clearTrustMark(directory);

    this.deps.logger.debug(
      {
        op: 'claude.session.lifecycle',
        layer: 'adapter',
        sessionId,
        phase: 'starting',
        workspacePath: directory,
        claudeSessionId: this.start.claudeSessionId?.value ?? this.start.resumeSessionId,
        trustMark: clearance,
      },
      'opening a claude session',
    );

    const options = buildSdkOptions({
      workspace: this.start.workspace,
      model: this.start.model,
      permissionMode: this.start.permissionMode,
      resumeSessionId: this.start.resumeSessionId,
      claudeSessionId: this.start.claudeSessionId?.value ?? null,
      limits: this.deps.limits,
      abortController: this.abort,
      onStderr: (data) => {
        this.onStderr(sessionId, data);
      },
    });

    this.query = this.deps.createQuery({
      prompt: this.queue,
      options: {
        ...options,

        // Stated here, and not inside the factory, on purpose. These two are the settings whose
        // absence switches a protection off in silence, so `pnpm scan:security` reads them from
        // the arguments of this very call — the one place a reviewer and a scanner both look.
        // Omitting `settingSources` loads the user scope and its personal `allow` rules, which
        // skip `canUseTool`; `[]` would instead drop the project's CLAUDE.md. `['project']` keeps
        // both. See docs/architecture/backend/04-claude-integration.md#a-armadilha-do-settingsources.
        settingSources: ['project'],

        // The product itself. Without it the SDK falls back to its own classification and runs
        // whatever it considers safe, with nobody asked — which is a remote shell with no owner.
        canUseTool: this.canUseTool(),
        hooks: {
          PreToolUse: [{ hooks: [this.auditHook(sessionId)] }],
          // The three that make undo possible. They are separate from the trail on purpose: the
          // trail records the **intention** and may refuse the tool, while these record what the
          // disk looked like before and after, and may never refuse anything.
          UserPromptSubmit: [{ hooks: [this.turnHook()] }],
          PostToolUse: [{ hooks: [this.resultHook()] }],
          // Deliberately not registered for `PostToolUseFailure`: a tool that failed did not
          // change the file, and recording a hash there would create a false baseline.
        },
      } satisfies Options,
    });

    void this.consume(this.query);
  }

  /**
   * `canUseTool` — the one function the agent loop waits on.
   *
   * Written here, beside `settingSources` and the hook, rather than inside the options factory:
   * these are the three settings whose absence turns a protection off **in silence**, so they live
   * where a reviewer and `pnpm scan:security` both read them — in the arguments of the call that
   * reaches the SDK. A factory that supplied them would satisfy the type and hide them from both.
   *
   * The wait itself is the gate's; what belongs here is the translation, and the refusal always
   * carries a message, because that message is what goes back to Claude.
   *
   * The answer never carries `updatedPermissions`, whatever the SDK suggested. A rule handed back
   * is applied by the CLI without calling this again, and nothing takes it out of a live session —
   * revoking one of ours would stop working until the next session. Our rule is the only authority
   * ([D-09](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
   */
  private canUseTool(): CanUseTool {
    return (toolName, input, options): Promise<PermissionResult> =>
      this.inTurn(async (): Promise<PermissionResult> => {
        const verdict = await this.deps.permissions.ask({
          sessionId: this.start.sessionId,
          requestId: options.requestId,
          toolUseId: options.toolUseID ?? null,
          toolName,
          input,
          signal: options.signal,
        });

        this.deps.logger.debug(
          {
            op: 'claude.permission.request',
            layer: 'adapter',
            sessionId: this.start.sessionId.value,
            requestId: options.requestId,
            toolName,
            decision: verdict.decision,
          },
          'canUseTool answered',
        );

        return verdict.decision === 'allow'
          ? { behavior: 'allow', updatedInput: input }
          : { behavior: 'deny', message: verdict.reason ?? 'denied' };
      });
  }

  prompt(text: string): void {
    this.deps.logger.debug(
      {
        op: 'claude.input',
        layer: 'adapter',
        sessionId: this.start.sessionId.value,
        length: text.length,
        prompt: text.slice(0, PROMPT_LOG_LIMIT),
        truncated: text.length > PROMPT_LOG_LIMIT,
      },
      'prompt queued',
    );

    // Queued with the prompt, in the same order, and adopted when the CLI opens the turn.
    this.pendingTraces.push(currentTraceId());
    this.queue.push(text);
  }

  async interrupt(): Promise<void> {
    await this.query?.interrupt();
  }

  async setModel(model: string): Promise<void> {
    await this.query?.setModel(model);
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    await this.query?.setPermissionMode(mode as SdkPermissionMode);
  }

  /** Ends the session. Safe to call twice, from a command and from the shutdown hook at once. */
  close(): Promise<void> {
    this.finish('closedByUser');
    return Promise.resolve();
  }

  /**
   * The single `for await` over the stream.
   *
   * Everything it can do is in the `finally`: whether the stream ended, threw, or was aborted, the
   * subprocess is released and the session is reported closed exactly once.
   */
  private async consume(query: Query): Promise<void> {
    let reason: SessionCloseReason = 'completed';

    try {
      for await (const message of query) {
        this.inTurn(() => {
          this.onMessage(message);
        });
      }
    } catch (error) {
      reason = 'failed';
      this.deps.logger.error(
        {
          op: 'claude.session.lifecycle',
          layer: 'adapter',
          sessionId: this.start.sessionId.value,
          phase: 'crashed',
          err: error,
        },
        'the claude stream ended in failure',
      );
    } finally {
      this.finish(reason);
    }
  }

  /** One message: logged, mapped, published. An unmapped variant is a warning and nothing else. */
  private onMessage(message: SDKMessage): void {
    const sessionId = this.start.sessionId.value;
    const mapped = this.mapper.read(message);

    this.deps.logger.debug(
      {
        op: 'claude.output',
        layer: 'adapter',
        sessionId,
        // Type and subtype always, payload never: a `Read` result carries the contents of a file,
        // and that must not reach the log.
        messageType: message.type,
        messageSubtype: 'subtype' in message ? message.subtype : undefined,
        events: mapped.events.map((event) => event.type),
      },
      'sdk message',
    );

    if (mapped.unknown !== null) {
      // The survival rule. A variant added by an SDK release costs a log line and a follow-up,
      // never an outage on somebody's machine.
      this.deps.logger.warn(
        { op: 'claude.output', layer: 'adapter', sessionId, variant: mapped.unknown },
        'unmapped sdk message variant — dropped',
      );
    }

    for (const event of mapped.events) {
      this.start.onEvent(event);
    }
  }

  /**
   * The `PreToolUse` hook: it records and it lets through.
   *
   * It does not decide — deciding is `canUseTool`'s job, and confusing the two is the hole this
   * separation exists to close. What it may do is **refuse**: a recorder that cannot write throws,
   * and a tool that cannot be recorded is not authorised.
   *
   * The refusal is a `deny` decision and **not** a rejected promise. A hook that throws takes the
   * stream down with it, and the graded rule says the opposite: the first failure denies the tool
   * with the session alive, and only the second consecutive one ends it. Turning the refusal into
   * the SDK's own way of saying no is what makes that rule true rather than aspirational
   * ([D-07](../../../../../docs/plans/01-live-session/decisions.md)).
   */
  private auditHook(sessionId: string) {
    return (input: unknown, toolUseId: string | undefined): Promise<HookJSONOutput> =>
      this.inTurn(async (): Promise<HookJSONOutput> => {
        const hook = input as {
          tool_name?: string;
          tool_input?: Record<string, unknown>;
          prompt_id?: string;
        };

        try {
          await this.deps.recorder.record({
            sessionId: this.start.sessionId,
            toolUseId: toolUseId ?? null,
            toolName: hook.tool_name ?? 'unknown',
            input: hook.tool_input ?? {},
            promptId: hook.prompt_id ?? null,
            at: this.deps.clock.now(),
          });
        } catch (error) {
          this.deps.logger.error(
            {
              op: 'claude.permission.request',
              layer: 'adapter',
              sessionId,
              toolName: hook.tool_name,
              err: error,
            },
            'the tool is refused because it could not be recorded',
          );

          return {
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: 'the audit trail could not be written',
            },
          };
        }

        this.deps.logger.debug(
          {
            op: 'claude.permission.request',
            layer: 'adapter',
            sessionId,
            toolUseId,
            toolName: hook.tool_name,
            // The whole input, deliberately: this line is part of the trail, not a sample of it.
            input: hook.tool_input,
          },
          'tool invocation recorded',
        );

        // After the trail and never before it: the snapshot is best-effort and the trail is not, so
        // a snapshot that somehow failed must not be able to stop a tool the trail already recorded.
        for (const path of pathsWrittenBy(hook.tool_name ?? '', hook.tool_input)) {
          await this.deps.journal.captureBefore(
            this.start.sessionId,
            hook.prompt_id ?? 'unknown',
            path,
          );
        }

        return { continue: true };
      });
  }

  /**
   * `UserPromptSubmit`: opens the checkpoint of a turn.
   *
   * The prompt text is what labels the undo point in the UI — "revert the turn where I asked it
   * to refactor the parser" is a sentence somebody can act on, and a `prompt_id` is not.
   */
  private turnHook() {
    return (input: unknown): Promise<HookJSONOutput> => {
      // The turn of the oldest prompt still waiting: prompts are taken in the order they were
      // queued, and this hook is the CLI saying it has taken one.
      // A turn with no prompt of ours behind it keeps the trace it had.
      const queued = this.pendingTraces.shift();
      if (queued !== undefined) {
        this.turnTrace = queued;
      }

      return this.inTurn(async (): Promise<HookJSONOutput> => {
        const hook = input as { prompt?: string; prompt_id?: string };

        await this.deps.journal.openTurn(
          this.start.sessionId,
          hook.prompt_id ?? 'unknown',
          hook.prompt ?? '',
        );

        return { continue: true };
      });
    };
  }

  /**
   * `PostToolUse`: records how the session left each file the tool wrote.
   *
   * After the write, because the hash only exists then. It never refuses: the worst a failure here
   * costs is an undo that declines to promise that path, and that is a price worth paying to keep
   * a journal failure from stopping somebody's work.
   */
  private resultHook() {
    return (input: unknown): Promise<HookJSONOutput> =>
      this.inTurn(async (): Promise<HookJSONOutput> => {
        const hook = input as { tool_name?: string; tool_input?: unknown };

        for (const path of pathsWrittenBy(hook.tool_name ?? '', hook.tool_input)) {
          await this.deps.journal.recordResult(this.start.sessionId, path);
        }

        return { continue: true };
      });
  }

  /**
   * Runs `body` under the trace of the current turn.
   *
   * What the SDK calls back into — a hook, `canUseTool`, a message of the stream — is logged, written
   * to the trail and published under the `traceId` of the prompt that caused it, which is what makes
   * the trace lead from a record of the trail to the log and to the event (S-31).
   */
  private inTurn<T>(body: () => T): T {
    const traceId = this.turnTrace;

    return traceId === null ? body() : runWithTrace({ traceId }, body);
  }

  /** The SDK's own channel for telling us we shadowed our permission callback. */
  private onStderr(sessionId: string, data: string): void {
    const shadowed = data.includes('CAN_USE_TOOL_SHADOWED');

    this.deps.logger.debug(
      { op: 'claude.output', layer: 'adapter', sessionId, stderr: data.trim() },
      'sdk stderr',
    );

    if (shadowed) {
      // One of our own options auto-approved a tool before the callback was consulted. It is the
      // only place the SDK says so, and a backend that did not read this channel would see a
      // session behaving normally with the approval quietly switched off.
      this.deps.logger.error(
        { op: 'claude.session.lifecycle', layer: 'adapter', sessionId, stderr: data.trim() },
        'the sdk reports canUseTool was shadowed by our own options',
      );
    }
  }

  /** Releases everything, once. */
  private finish(reason: SessionCloseReason): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.queue.close();

    // Before the abort, so the questions are settled by the module that owns them rather than
    // only by the signal that releases our own promises. A request left pending is a row in the
    // history claiming somebody is still deciding about a session that no longer exists.
    this.deps.permissions.forget(this.start.sessionId);

    try {
      this.query?.close();
    } catch (error) {
      this.deps.logger.warn(
        {
          op: 'claude.session.lifecycle',
          layer: 'adapter',
          sessionId: this.start.sessionId.value,
          err: error,
        },
        'closing the query failed',
      );
    }

    // Belt and braces: `close()` should be enough, and a subprocess left behind is a real cost on
    // the user's machine, so the abort signal is fired as well.
    this.abort.abort();

    this.deps.logger.debug(
      {
        op: 'claude.session.lifecycle',
        layer: 'adapter',
        sessionId: this.start.sessionId.value,
        phase: 'closed',
        exitReason: reason,
      },
      'claude session closed',
    );

    this.start.onClosed(reason);
  }
}
