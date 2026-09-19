import type {
  HookCallbackMatcher,
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

import { loadFixture } from './fixture';
import type { AgentSdkFixture } from './fixture';

/** How many scripted runs this process has opened, so each one can name itself. */
let runs = 0;

/**
 * Where the hooks of a turn belong in its replay.
 *
 * Just after the message that announces the tool — that is when the real SDK fires `PreToolUse`
 * and consults `canUseTool`, and by then the session has already reported a tool starting. A
 * recording with no tool call in it has no hooks to place, and the whole replay goes first.
 *
 * @param messages the turn's replay, in order
 * @returns how many messages come before the hooks
 */
function firstToolCallIn(messages: readonly SDKMessage[]): number {
  const index = messages.findIndex(
    (message) =>
      message.type === 'assistant' &&
      Array.isArray(message.message.content) &&
      message.message.content.some((block) => block.type === 'tool_use'),
  );

  return index === -1 ? messages.length : index + 1;
}

/** `[hold]`, the way a prompt asks for a turn that does not finish until it is interrupted. */
const HOLD_TAG = /\[hold\]/i;

/** `[fixture:tool-turn]`, the way a prompt asks for a particular recording. */
const FIXTURE_TAG = /\[fixture:([a-z0-9-]+)\]/i;

/**
 * The recording a prompt asked for, or `null` when it asked for none.
 *
 * A control for the tests and nothing else: the real SDK has no such thing, and a prompt that
 * carries no tag replays whatever the run was started with.
 */
function fixtureNamedIn(prompt: string): string | null {
  return FIXTURE_TAG.exec(prompt)?.[1] ?? null;
}

/** What the caller can see about a scripted run, once it has happened. */
export interface ScriptRecord {
  /** Prompts the runner pushed onto the input queue, in order. */
  readonly prompts: string[];
  /** Turns the scripted `UserPromptSubmit` hook opened. */
  readonly turns: string[];
  /** Tools the scripted `PreToolUse` hook fired for. */
  readonly hooked: string[];
  /** Tools the scripted `PostToolUse` hook fired for. */
  readonly completed: string[];
  /** Tools the scripted run consulted `canUseTool` about. */
  readonly asked: string[];
  /** How many times `interrupt()` was called. */
  interrupts: number;
  /** How many times `close()` was called. */
  closes: number;
  /** The options the runner built, so a test can assert on what was sent to the SDK. */
  options: Options | null;
}

/** How a scripted run behaves beyond simply replaying. */
export interface ScriptOptions {
  /** Fixture to replay for every turn. */
  readonly fixture?: string;

  /** Thrown from the stream instead of replaying, to exercise the failure path. */
  readonly failWith?: Error;

  /** Replays nothing and never ends, so a test can observe a session that is simply alive. */
  readonly silent?: boolean;

  /** Lines written to `stderr` before the stream starts, as the CLI writes its own warnings. */
  readonly stderr?: readonly string[];

  /** Thrown by `close()`, for the case where releasing the subprocess is the thing that fails. */
  readonly closeThrows?: Error;

  /**
   * Fires the hooks with only the fields the SDK guarantees.
   *
   * Several of them are documented as "absent on older producers", so a consumer that assumed
   * they were always there would work until the day somebody ran an older CLI.
   */
  readonly sparseHooks?: boolean;

  /** Messages appended to the replay, for variants no fixture happens to contain. */
  readonly extraMessages?: readonly unknown[];
}

/**
 * The Agent SDK, replaying a recorded run.
 *
 * It is a fake and not a mock: it reproduces the **shape** of a real stream, including the two
 * things that are easy to get wrong from memory and that the product depends on —
 *
 * - the `PreToolUse` hook fires for **every** tool, and `canUseTool` only for some of them. The
 *   recording of `tool-turn` measured four hooks and one callback; a fake that called both for
 *   everything would make an audit trail hung on the wrong one look correct;
 * - nothing is emitted until a prompt arrives. The real SDK waits on the input iterable, and a
 *   fake that streamed immediately would hide every ordering bug there is.
 *
 * Everything it knows came from `pnpm fixtures:record`. See
 * docs/plans/01-live-session/F2-session-runtime.md.
 */
export class ScriptedQuery implements AsyncGenerator<SDKMessage, void> {
  private fixture: AgentSdkFixture;
  private iterator: AsyncIterator<SDKUserMessage> | null = null;
  private closed = false;

  constructor(
    private readonly prompt: AsyncIterable<SDKUserMessage>,
    private readonly options: Options,
    private readonly script: ScriptOptions,
    readonly record: ScriptRecord,
  ) {
    this.fixture = loadFixture(script.fixture ?? 'text-turn');
    record.options = options;

    for (const line of script.stderr ?? []) {
      options.stderr?.(line);
    }
  }

  async next(): Promise<IteratorResult<SDKMessage, void>> {
    if (this.closed) {
      return { value: undefined, done: true };
    }

    const queued = this.pending.shift();
    if (queued !== undefined) {
      return { value: queued, done: false };
    }

    // Held until interrupted, with nothing arriving: a tool that takes minutes looks exactly
    // like this from the outside.
    if (this.holding.length > 0) {
      await new Promise<void>((resolve) => {
        this.release = resolve;
      });

      this.pending.push(...this.holding);
      this.holding = [];

      const resumed = this.pending.shift();
      if (resumed !== undefined) {
        return { value: resumed, done: false };
      }
    }

    // The tool has been announced and the model is waiting on it: this is where the real stream
    // fires `PreToolUse`, asks `canUseTool` and then reports the result.
    if (this.hooksPending) {
      this.hooksPending = false;
      await this.replayHooks();
      this.pending.push(...this.afterHooks);
      this.afterHooks = [];

      const next = this.pending.shift();
      if (next !== undefined) {
        return { value: next, done: false };
      }
    }

    const prompt = await this.nextPrompt();
    if (prompt === null) {
      return { value: undefined, done: true };
    }

    if (this.script.failWith !== undefined) {
      throw this.script.failWith;
    }

    // A prompt may name the recording it wants replayed. It is how one running stack covers both
    // the turn that asks for permission and the turn that does not — an end-to-end suite gets one
    // backend per run, and starting a second one per scenario would cost more than it proves.
    this.fixture = loadFixture(fixtureNamedIn(prompt) ?? this.script.fixture ?? 'text-turn');

    // Every turn opens with `UserPromptSubmit`, as the real SDK does. A fake that skipped it would
    // leave the checkpoint of the turn unopened, and the undo point unlabelled.
    this.record.turns.push(prompt);
    await this.fire(
      'UserPromptSubmit',
      this.script.sparseHooks === true ? {} : { prompt, prompt_id: this.promptId },
    );

    // The messages up to and including the one that announces the tool, then the hooks, then the
    // rest. A fake that fired every hook before emitting anything would have `canUseTool` block a
    // session that has not started answering yet — and the status machine, which only reaches
    // `waitingPermission` from `thinking` or `running`, would never get there. The real stream
    // never does that: a tool call is something the model decided partway through a turn.
    const replay = [
      ...this.fixture.messages,
      ...((this.script.extraMessages ?? []) as SDKMessage[]),
    ];
    const split = firstToolCallIn(replay);

    // A held turn keeps its last message — the `result` — back until somebody interrupts it. It
    // is how a long-running tool is modelled: the session sits in `running` with nothing arriving,
    // which is exactly the case `session.interrupt` exists for.
    const held = HOLD_TAG.test(prompt);
    const body = held ? replay.slice(0, -1) : replay;
    this.holding = held ? replay.slice(-1) : [];

    this.pending.push(...body.slice(0, split));
    this.afterHooks = body.slice(split);
    this.hooksPending = this.fixture.preToolUse.length > 0;

    const first = this.pending.shift();
    return first === undefined ? { value: undefined, done: true } : { value: first, done: false };
  }

  /** Messages produced for the current turn and not yet taken. */
  private readonly pending: SDKMessage[] = [];

  /** What follows the tool call: pushed once the hooks and the callback have run. */
  private afterHooks: SDKMessage[] = [];

  /** What a held turn is keeping back until it is interrupted. */
  private holding: SDKMessage[] = [];

  /** Whether this turn still owes its hooks. */
  private hooksPending = false;

  /** Released by `interrupt()`, for a turn that was told to hold until somebody stops it. */
  private release: (() => void) | null = null;

  /** The text of the next prompt, or `null` when the input ended or the run was closed. */
  private async nextPrompt(): Promise<string | null> {
    this.iterator ??= this.prompt[Symbol.asyncIterator]();

    const next = await this.iterator.next();
    if (next.done === true || this.closed) {
      return null;
    }

    const content = next.value.message.content;
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    this.record.prompts.push(text);

    if (this.script.silent === true) {
      // A session that is up and producing nothing. Waiting for ever is the honest shape of it,
      // and the test ends it by closing the query.
      return new Promise<string | null>(() => undefined);
    }

    return text;
  }

  /** The turn the current replay belongs to. Every hook of the SDK carries it. */
  private readonly promptId = 'prompt-1';

  /** Unique to this scripted run, so no two sessions ever mint the same `requestId`. */
  private readonly runId = `run-${String((runs += 1))}`;

  /**
   * Fires the hooks and the callback the recording says this turn fired.
   *
   * In recorded order, and with the asymmetry intact: every tool reaches `PreToolUse`, only the
   * ones the real run asked about reach `canUseTool`, and every one of them is followed by
   * `PostToolUse` — which is where the file journal learns what the write left behind.
   */
  private async replayHooks(): Promise<void> {
    const asked = new Set(this.fixture.canUseTool.map((entry) => entry.toolName));

    for (const [index, invocation] of this.fixture.preToolUse.entries()) {
      const input = this.fixture.canUseTool.find(
        (entry) => entry.toolName === invocation.toolName,
      )?.input;
      const toolUseId = invocation.toolUseId ?? `tool-${String(index)}`;

      this.record.hooked.push(invocation.toolName);
      await this.fire(
        'PreToolUse',
        this.script.sparseHooks === true
          ? {}
          : {
              tool_name: invocation.toolName,
              tool_input: input ?? {},
              tool_use_id: toolUseId,
              prompt_id: this.promptId,
            },
        this.script.sparseHooks === true ? undefined : toolUseId,
      );

      if (asked.has(invocation.toolName)) {
        this.record.asked.push(invocation.toolName);
        await this.options.canUseTool?.(
          invocation.toolName,
          (input ?? {}) as Record<string, unknown>,
          {
            signal: new AbortController().signal,
            // `requestId` is the idempotency key the permission bridge branches on, so a fake
            // that left it constant would make every request look like a redelivery of the first
            // — and one that only varied within a run would make the second **session** inherit
            // the first session's answers. The real SDK mints a fresh one per call.
            requestId: `${this.runId}-request-${String(index)}`,
            toolUseID: toolUseId,
          },
        );
      }

      this.record.completed.push(invocation.toolName);
      await this.fire(
        'PostToolUse',
        this.script.sparseHooks === true
          ? {}
          : {
              tool_name: invocation.toolName,
              tool_input: input ?? {},
              tool_response: {},
              tool_use_id: toolUseId,
              prompt_id: this.promptId,
            },
        this.script.sparseHooks === true ? undefined : toolUseId,
      );
    }
  }

  /** One hook call, through every matcher the options registered for that event. */
  private async fire(
    event: 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit',
    input: Record<string, unknown>,
    toolUseId?: string,
  ): Promise<void> {
    const matchers: readonly HookCallbackMatcher[] = this.options.hooks?.[event] ?? [];

    for (const matcher of matchers) {
      for (const hook of matcher.hooks) {
        await hook(
          { hook_event_name: event, session_id: 'scripted', ...input } as never,
          toolUseId,
          { signal: new AbortController().signal },
        );
      }
    }
  }

  return(): Promise<IteratorResult<SDKMessage, void>> {
    this.closed = true;
    return Promise.resolve({ value: undefined, done: true });
  }

  throw(error: unknown): Promise<IteratorResult<SDKMessage, void>> {
    this.closed = true;
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }

  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> {
    return this;
  }

  /**
   * Ends the turn that is running, as the real `interrupt()` does.
   *
   * A fake that only counted the call would make every interrupt test assert that a number went
   * up — and the thing worth proving is that the session comes back to `idle`, which only happens
   * because the turn produces its `result`.
   */
  interrupt(): Promise<undefined> {
    this.record.interrupts += 1;
    this.release?.();
    this.release = null;

    return Promise.resolve(undefined);
  }

  setModel(): Promise<void> {
    return Promise.resolve();
  }

  setPermissionMode(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.record.closes += 1;
    this.closed = true;

    if (this.script.closeThrows !== undefined) {
      throw this.script.closeThrows;
    }
  }
}

/** A fresh record, and the factory that fills it. */
export function scriptedSdk(script: ScriptOptions = {}): {
  createQuery: (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => Query;
  record: ScriptRecord;
} {
  const record: ScriptRecord = {
    prompts: [],
    turns: [],
    hooked: [],
    completed: [],
    asked: [],
    interrupts: 0,
    closes: 0,
    options: null,
  };

  return {
    record,
    createQuery: (params) =>
      new ScriptedQuery(params.prompt, params.options, script, record) as unknown as Query,
  };
}
