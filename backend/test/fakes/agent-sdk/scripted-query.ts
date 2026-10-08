import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { sep } from 'node:path';

import type {
  HookCallbackMatcher,
  McpServerStatus,
  ModelInfo,
  Options,
  Query,
  SDKControlGetContextUsageResponse,
  SDKMessage,
  SDKUserMessage,
  SessionMessage,
  SlashCommand,
} from '@anthropic-ai/claude-agent-sdk';

import { loadCommands, loadFixture, loadInstallation } from './fixture';
import type { AgentSdkFixture, InstallationFixture } from './fixture';
import { renumber } from './scripted-transcripts';
import type { ScriptedTranscripts } from './scripted-transcripts';

/** How many scripted runs this process has opened, so each one can name itself. */
let runs = 0;

/** How many turns this process has written to a store — what makes every written turn's ids its own. */
let written = 0;

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
  /** How many times `supportedCommands()` was asked. */
  commandCalls: number;

  /** How many times each question about the installation was asked. */
  installationCalls: Record<keyof InstallationFixture, number>;
  /** The options the runner built, so a test can assert on what was sent to the SDK. */
  options: Options | null;
  /** The modes `setPermissionMode()` was called with, in order — what the SDK was told. */
  readonly modes: string[];
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

  /**
   * What `supportedCommands()` answers instead of the recorded catalogue: a narrower installation,
   * or an error to throw — the CLI failing to list, or never answering at all (`'hang'`).
   */
  readonly commands?: readonly SlashCommand[] | Error | 'hang';

  /** The MCP servers of the session: none were configured where the installation was recorded. */
  readonly mcpServers?: readonly McpServerStatus[];

  /** A failure for the three questions about the installation — or a CLI that never answers them. */
  readonly installationFails?: Error | 'hang';

  /**
   * The CLI refuses the point a fork starts from (`resumeDropsTurn`), as it does when the dropped
   * range holds more than the turn: the first turn is an `error_during_execution` result, and the
   * stream ends (plan 08, D-19).
   */
  readonly refuseFork?: boolean;

  /**
   * Performs the file writes the recording describes, under this directory instead of the
   * recording's `/workspace`, between `PreToolUse` and `PostToolUse` — where the real CLI writes.
   * `'cwd'` is the directory the session runs in, which is where the real CLI writes.
   *
   * A replay that only fired the hooks left the disk untouched, and the undo, which is about the
   * disk, would have had nothing real to put back. Only `Write` is performed: it is what the
   * recordings contain, and its input says everything the write needs.
   *
   * The same directory takes the recording's place in what Claude says, too (`spokenIn`): a turn
   * that names where it runs names the session's directory, as the real CLI would (plan 06, S-156).
   */
  readonly performWritesIn?: string;

  /**
   * The store of conversations the replay writes into, as the real CLI does with
   * `persistSession: true`: the prompt and every message of the turn, under the conversation the
   * options name — a new one, one continued in place, or a fork of one begun elsewhere.
   *
   * With a store, every turn's ids are **its own**: the uuids, the API message ids and the tool use
   * ids. The real CLI never writes the same id twice into a conversation, and a replay that did would
   * fold every turn of a continued conversation into one message on screen. Without a store the
   * first turn stays the recording byte for byte.
   */
  readonly transcripts?: ScriptedTranscripts;
}

/** The tools a replay performs on disk: the file tools of the recordings. */
const PERFORMED_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit']);

/** One replacement of an `Edit`, or of a `MultiEdit`'s list. */
interface RecordedEdit {
  readonly old_string: string;
  readonly new_string: string;
  readonly replace_all?: boolean;
}

function editsOf(input: unknown): RecordedEdit[] {
  const edits = (input as { edits?: unknown } | null)?.edits;
  return Array.isArray(edits) ? (edits as RecordedEdit[]) : [];
}

/** What an edit leaves of `text`: each replacement, the first occurrence or every one. */
function edited(toolName: string, input: unknown, text: string): string {
  const edits = toolName === 'MultiEdit' ? editsOf(input) : [input as RecordedEdit];

  return edits.reduce(
    (current, edit) =>
      edit.replace_all === true
        ? current.split(edit.old_string).join(edit.new_string)
        : current.replace(edit.old_string, () => edit.new_string),
    text,
  );
}

/**
 * The result the CLI ends with when it refuses the point of a fork — the wording its documentation
 * gives (`resumeDropsTurn`), the rest zeroed as on a startup failure.
 */
function forkRefusal(droppedTurn: string): SDKMessage {
  return {
    type: 'result',
    subtype: 'error_during_execution',
    duration_ms: 0,
    duration_api_ms: 0,
    is_error: true,
    num_turns: 0,
    stop_reason: null,
    total_cost_usd: 0,
    usage: {},
    modelUsage: {},
    permission_denials: [],
    errors: [
      `Resume rejected by --resume-drops-turn: entries past the point are not ${droppedTurn}'s`,
    ],
    uuid: randomUUID(),
    session_id: 'scripted',
  } as unknown as SDKMessage;
}

/** Whether two inputs are the same, whatever order their keys were written in. */
function sameInput(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** What a turn after the first appends to every tool use id it replays. Nothing on the first. */
function turnSuffix(turn: number): string {
  return turn <= 1 ? '' : `-turn-${String(turn)}`;
}

/**
 * The recording as turn `turn` of a run replays it: the same, with tool use ids of its own.
 *
 * The real SDK never hands the same `tool_use_id` to two turns. A fake that replayed the
 * recorded ones on every turn made the second turn of a session a **redelivery** of the first, and
 * the trail — which drops a redelivered invocation on purpose — silently wrote nothing for it. The
 * ids are rewritten in the messages and the hooks alike, so an event and its entry still agree;
 * the first turn is the recording byte for byte.
 */
function forTurn(fixture: AgentSdkFixture, turn: number): AgentSdkFixture {
  const suffix = turnSuffix(turn);
  if (suffix === '') {
    return fixture;
  }

  let text = JSON.stringify(fixture);
  for (const { toolUseId } of fixture.preToolUse) {
    if (toolUseId !== undefined) {
      text = text.replaceAll(toolUseId, `${toolUseId}${suffix}`);
    }
  }

  return JSON.parse(text) as AgentSdkFixture;
}

/** Whether a string is a uuid, which a minted id has to stay: the history pages by it. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every id a recording carries that a conversation may not see twice. */
function idsOf(fixture: AgentSdkFixture): Set<string> {
  const ids = new Set<string>();

  for (const invocation of fixture.preToolUse) {
    if (invocation.toolUseId !== undefined) {
      ids.add(invocation.toolUseId);
    }
  }

  for (const message of fixture.messages) {
    if (typeof message.uuid === 'string') {
      ids.add(message.uuid);
    }
    if (message.type !== 'assistant') {
      continue;
    }
    if (typeof message.message.id === 'string') {
      ids.add(message.message.id);
    }
    for (const block of Array.isArray(message.message.content) ? message.message.content : []) {
      if (block.type === 'tool_use') {
        ids.add(block.id);
      }
    }
  }

  return ids;
}

/**
 * The recording as turn `turn` of the conversation `conversationId` writes it: every id minted
 * afresh, in the stream and in the hooks alike, and every message filed under the conversation.
 *
 * A uuid stays a uuid — the history pages by it — and every other id keeps its prefix, so a
 * `toolu_…` still reads as one.
 */
function asTurnOf(fixture: AgentSdkFixture, conversationId: string, turn: number): AgentSdkFixture {
  let text = JSON.stringify(fixture);

  for (const id of idsOf(fixture)) {
    text = text.replaceAll(id, UUID_SHAPE.test(id) ? renumber(id, turn) : `${id}-${String(turn)}`);
  }

  const recorded = new Set(fixture.messages.map((message) => message.session_id));
  for (const sessionId of recorded) {
    if (sessionId !== undefined) {
      text = text.replaceAll(sessionId, conversationId);
    }
  }

  return JSON.parse(text) as AgentSdkFixture;
}

/** The recorder's name for the throwaway directory a recording ran in, as a whole path segment. */
const RECORDED_DIRECTORY = /\/workspace(?![\w.-])/g;

/**
 * The recording as Claude would have said it in `directory`.
 *
 * The recorder writes its throwaway directory as `/workspace`; a real CLI running in `directory`
 * names `directory` instead. Only what Claude **says** is moved — the text of its answer and of
 * the result: a tool's input stays the recording's, byte for byte, because the rules the suites
 * grant match on it, and a write already goes where {@link ScriptOptions.performWritesIn} puts it.
 */
function spokenIn(fixture: AgentSdkFixture, directory: string | undefined): AgentSdkFixture {
  if (directory === undefined) {
    return fixture;
  }

  const moved = (text: string): string => text.replace(RECORDED_DIRECTORY, () => directory);
  const messages = fixture.messages.map((message): SDKMessage => {
    if (message.type === 'result' && message.subtype === 'success') {
      return { ...message, result: moved(message.result) };
    }
    if (message.type !== 'assistant' || !Array.isArray(message.message.content)) {
      return message;
    }

    const content = message.message.content.map((block) =>
      block.type === 'text' ? { ...block, text: moved(block.text) } : block,
    );
    return { ...message, message: { ...message.message, content } };
  });

  return { ...fixture, messages };
}

/** A message of the stream as `getSessionMessages` returns it, or `null` when it is not one. */
function asStored(message: SDKMessage): SessionMessage | null {
  if (message.type !== 'user' && message.type !== 'assistant') {
    return null;
  }

  return {
    type: message.type,
    uuid: String(message.uuid),
    session_id: String(message.session_id),
    message: message.message,
    parent_tool_use_id: message.parent_tool_use_id,
    parent_agent_id: null,
  };
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

  /** The stream ends once what is pending went out — the CLI that refused a fork exits. */
  private ending = false;

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
    const produced = await this.produce();

    if (produced.done !== true) {
      this.persist(produced.value);
    }

    return produced;
  }

  /** The next message of the replay, before anything is written about it. */
  private async produce(): Promise<IteratorResult<SDKMessage, void>> {
    if (this.closed) {
      return { value: undefined, done: true };
    }

    const ready = this.pending.shift() ?? (await this.resumed()) ?? (await this.pastTheHooks());
    if (ready !== undefined) {
      return { value: ready, done: false };
    }
    if (this.ending) {
      return { value: undefined, done: true };
    }

    const prompt = await this.nextPrompt();
    if (prompt === null) {
      return { value: undefined, done: true };
    }

    if (this.script.failWith !== undefined) {
      throw this.script.failWith;
    }

    await this.openTurn(prompt);

    const first = this.pending.shift();
    return first === undefined ? { value: undefined, done: true } : { value: first, done: false };
  }

  /**
   * What a held turn lets go of once it is interrupted, or `undefined` when no turn is held.
   *
   * Held until interrupted, with nothing arriving: a tool that takes minutes looks exactly like
   * this from the outside.
   */
  private async resumed(): Promise<SDKMessage | undefined> {
    if (this.holding.length === 0) {
      return undefined;
    }

    await new Promise<void>((resolve) => {
      this.release = resolve;
    });

    this.pending.push(...this.holding);
    this.holding = [];

    return this.pending.shift();
  }

  /**
   * What follows the tool call, once the hooks have run — or `undefined` when the turn owes none.
   *
   * The tool has been announced and the model is waiting on it: this is where the real stream
   * fires `PreToolUse`, asks `canUseTool` and then reports the result.
   */
  private async pastTheHooks(): Promise<SDKMessage | undefined> {
    if (!this.hooksPending) {
      return undefined;
    }

    this.hooksPending = false;
    await this.replayHooks();
    this.pending.push(...this.afterHooks);
    this.afterHooks = [];

    return this.pending.shift();
  }

  /** Starts the turn a prompt asks for: its recording, its `UserPromptSubmit`, its replay queued. */
  private async openTurn(prompt: string): Promise<void> {
    // A prompt may name the recording it wants replayed. It is how one running stack covers both
    // the turn that asks for permission and the turn that does not — an end-to-end suite gets one
    // backend per run, and starting a second one per scenario would cost more than it proves.
    this.turns += 1;
    const recording = spokenIn(
      loadFixture(fixtureNamedIn(prompt) ?? this.script.fixture ?? 'text-turn'),
      this.writesRoot,
    );
    const conversation = this.conversation;
    this.fixture =
      conversation === null
        ? forTurn(recording, this.turns)
        : asTurnOf(recording, conversation.id, (written += 1));
    this.persistPrompt();

    // Every turn opens with `UserPromptSubmit`, as the real SDK does. A fake that skipped it would
    // leave the checkpoint of the turn unopened, and the undo point unlabelled.
    this.record.turns.push(prompt);

    if (this.script.refuseFork === true && this.options.resumeDropsTurn !== undefined) {
      this.pending.push(forkRefusal(this.options.resumeDropsTurn));
      this.ending = true;
      return;
    }

    await this.fire('UserPromptSubmit', { prompt, prompt_id: this.promptId });

    this.queueReplay(HOLD_TAG.test(prompt));
  }

  /**
   * Queues the turn's replay: the messages up to and including the one that announces the tool,
   * then the hooks, then the rest.
   *
   * A fake that fired every hook before emitting anything would have `canUseTool` block a session
   * that has not started answering yet — and the status machine, which only reaches
   * `waitingPermission` from `thinking` or `running`, would never get there. The real stream never
   * does that: a tool call is something the model decided partway through a turn.
   *
   * @param held whether the turn keeps its last message — the `result` — back until somebody
   *   interrupts it. It is how a long-running tool is modelled: the session sits in `running` with
   *   nothing arriving, which is exactly the case `session.interrupt` exists for.
   */
  private queueReplay(held: boolean): void {
    const replay = [
      ...this.fixture.messages,
      ...((this.script.extraMessages ?? []) as SDKMessage[]),
    ];
    const split = firstToolCallIn(replay);

    const body = held ? replay.slice(0, -1) : replay;
    this.holding = held ? replay.slice(-1) : [];

    this.pending.push(...body.slice(0, split));
    this.afterHooks = body.slice(split);
    this.hooksPending = this.fixture.preToolUse.length > 0;
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

  /** The prompt the current turn answers, as the input iterable handed it over. */
  private prompted: SDKUserMessage | null = null;

  /** Whether the fork this run is has been written yet. A fork is written by its first prompt. */
  private forked = false;

  /**
   * The conversation this run writes to, and where it is filed — or `null` when there is no store.
   *
   * Named the way the options name it: `sessionId` for a new conversation and for a fork, `resume`
   * alone for one continued in place.
   */
  private get conversation(): { readonly id: string; readonly cwd: string } | null {
    const id = this.options.sessionId ?? this.options.resume;

    if (this.script.transcripts === undefined || id === undefined) {
      return null;
    }

    return { id, cwd: this.options.cwd ?? process.cwd() };
  }

  /** Writes the prompt that opened a turn, forking the conversation first when this run is one. */
  private persistPrompt(): void {
    const conversation = this.conversation;
    const store = this.script.transcripts;

    if (conversation === null || store === undefined || this.prompted === null) {
      return;
    }

    const origin = this.options.resume;
    if (this.options.forkSession === true && origin !== undefined && !this.forked) {
      store.fork(origin, conversation.id, conversation.cwd);
      this.forked = true;
    }

    store.persist(conversation.id, conversation.cwd, [
      {
        type: 'user',
        // Under the uuid the prompt was streamed with, as the real CLI files it — the id a fork of
        // an edit-and-resend starts from (`forkSession`'s `upToMessageId`).
        uuid: this.prompted.uuid ?? randomUUID(),
        session_id: conversation.id,
        message: this.prompted.message,
        parent_tool_use_id: null,
        parent_agent_id: null,
      },
    ]);
  }

  /** Writes a message the turn produced, when it is one a transcript keeps. */
  private persist(message: SDKMessage): void {
    const conversation = this.conversation;
    const stored = asStored(message);

    if (conversation !== null && stored !== null) {
      this.script.transcripts?.persist(conversation.id, conversation.cwd, [stored]);
    }
  }

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
    this.prompted = next.value;

    if (this.script.silent === true) {
      // A session that is up and producing nothing. Waiting for ever is the honest shape of it,
      // and the test ends it by closing the query.
      return new Promise<string | null>(() => undefined);
    }

    return text;
  }

  /**
   * The turn the current replay belongs to. Every hook of the SDK carries it.
   *
   * One per turn, as the real SDK mints one per prompt: a constant made every turn of a session
   * the same turn, and the undo — whose point is a turn — would have had only one point to go back
   * to, however many turns wrote files.
   */
  private get promptId(): string {
    return `${this.runId}-prompt-${String(this.turns)}`;
  }

  /** Unique to this scripted run, so no two sessions ever mint the same `requestId`. */
  private readonly runId = `run-${String((runs += 1))}`;

  /** How many turns this run has replayed — what makes each turn's tool use ids its own. */
  private turns = 0;

  /** How many times this run has consulted `canUseTool` — one fresh `requestId` per call. */
  private asks = 0;

  /**
   * Fires the hooks and the callback the recording says this turn fired.
   *
   * In recorded order, and with the asymmetry intact: every tool reaches `PreToolUse`, only the
   * ones the real run asked about reach `canUseTool`, and every one of them is followed by
   * `PostToolUse` — which is where the file journal learns what the write left behind.
   */
  private async replayHooks(): Promise<void> {
    // Consumed as they are matched: each recorded consultation answers exactly one invocation.
    const consultations = [...this.fixture.canUseTool];

    for (const [index, invocation] of this.fixture.preToolUse.entries()) {
      const consulted = this.consultationFor(invocation, consultations);
      const input =
        this.performed(
          invocation.toolName,
          this.recordedInputOf(invocation.toolUseId) ?? consulted?.input,
        ) ?? {};
      const toolUseId = invocation.toolUseId ?? `tool-${String(index)}${turnSuffix(this.turns)}`;

      this.record.hooked.push(invocation.toolName);
      await this.fire(
        'PreToolUse',
        {
          tool_name: invocation.toolName,
          tool_input: input,
          tool_use_id: toolUseId,
          prompt_id: this.promptId,
        },
        toolUseId,
      );

      if (consulted !== null) {
        await this.consult(invocation.toolName, input, toolUseId, index);
      }

      this.write(invocation.toolName, input);
      this.record.completed.push(invocation.toolName);
      await this.fire(
        'PostToolUse',
        {
          tool_name: invocation.toolName,
          tool_input: input,
          tool_response: {},
          tool_use_id: toolUseId,
          prompt_id: this.promptId,
        },
        toolUseId,
      );
    }
  }

  /** Asks `canUseTool` about one invocation, as the real run asked about it. */
  private async consult(
    toolName: string,
    input: unknown,
    toolUseId: string,
    index: number,
  ): Promise<void> {
    this.record.asked.push(toolName);
    await this.options.canUseTool?.(toolName, input as Record<string, unknown>, {
      signal: new AbortController().signal,
      // `requestId` is the idempotency key the permission bridge branches on, so a fake
      // that left it constant would make every request look like a redelivery of the first
      // — and one that only varied within a run would make the second **session** inherit
      // the first session's answers. Nor may it repeat across the turns of one session: the
      // second turn would inherit the first turn's answer, and a revoked rule would look as
      // if it still applied. The real SDK mints a fresh one per call.
      requestId: `${this.runId}-request-${String((this.asks += 1))}-${String(index)}`,
      toolUseID: toolUseId,
    });
  }

  /**
   * The input the model gave an invocation, read off its `tool_use` block in the recording.
   *
   * What the real hook receives is that input, whatever the tool — a replay that only knew the input
   * of the tools `canUseTool` was asked about would hand every `Read` an empty one.
   */
  private recordedInputOf(toolUseId: string | undefined): unknown {
    for (const message of this.fixture.messages) {
      if (message.type !== 'assistant' || !Array.isArray(message.message.content)) {
        continue;
      }

      for (const block of message.message.content) {
        if (block.type === 'tool_use' && block.id === toolUseId) {
          return block.input;
        }
      }
    }

    return undefined;
  }

  /**
   * The recorded consultation of `canUseTool` that belongs to this invocation, or `null` when the
   * real run did not ask about it.
   *
   * Matched by the tool **and its input**, because that is what the CLI decides on: in the recorded
   * `/init`, three `Bash` calls ran and one was asked about. A replay that asked about every
   * invocation of a tool whose name was ever asked about turned that one question into three — and
   * the asymmetry the audit trail rests on (every tool reaches the hook, only some reach
   * `canUseTool`) would have held in the recording and not in the replay (plan 01, S-90).
   *
   * An invocation recorded without its `tool_use` falls back to the first unanswered consultation of
   * the same tool.
   */
  private consultationFor(
    invocation: { readonly toolName: string; readonly toolUseId?: string },
    consultations: { readonly toolName: string; readonly input: unknown }[],
  ): { readonly toolName: string; readonly input: unknown } | null {
    const recorded = this.recordedInputOf(invocation.toolUseId);
    const position = consultations.findIndex(
      (entry) =>
        entry.toolName === invocation.toolName &&
        (recorded === undefined || sameInput(entry.input, recorded)),
    );

    return position === -1 ? null : (consultations.splice(position, 1)[0] ?? null);
  }

  /** The recorded input, moved under {@link ScriptOptions.performWritesIn} when writes are performed. */
  private performed(toolName: string, input: unknown): unknown {
    const root = this.writesRoot;

    if (
      root === undefined ||
      !PERFORMED_TOOLS.has(toolName) ||
      typeof input !== 'object' ||
      input === null
    ) {
      return input;
    }

    const recorded = input as { file_path?: unknown };
    return typeof recorded.file_path === 'string'
      ? { ...input, file_path: recorded.file_path.replace(/^\/workspace(?=\/)/, root) }
      : input;
  }

  /** Where this run performs its writes, or `undefined` when it performs none. */
  private get writesRoot(): string | undefined {
    const root = this.script.performWritesIn;
    return root === 'cwd' ? this.options.cwd : root;
  }

  /**
   * What the CLI does between the two hooks of a file tool, when this run performs writes.
   *
   * Only inside the directory it was given: a recording also writes where the CLI keeps its own
   * files — the plan of `plan-turn` goes to `~/.claude/plans/` of the machine it was recorded on —
   * and a replay that followed it would write into the home of whoever runs the suite.
   */
  private write(toolName: string, input: unknown): void {
    const root = this.writesRoot;

    if (root === undefined || !PERFORMED_TOOLS.has(toolName)) {
      return;
    }

    const { file_path: target, content } = (input ?? {}) as {
      file_path?: unknown;
      content?: unknown;
    };

    if (typeof target !== 'string' || !target.startsWith(`${root}${sep}`)) {
      return;
    }

    if (toolName === 'Write' && typeof content === 'string') {
      writeFileSync(target, content, 'utf8');
      return;
    }

    writeFileSync(
      target,
      edited(toolName, input, existsSync(target) ? readFileSync(target, 'utf8') : ''),
      'utf8',
    );
  }

  /**
   * One hook call, through every matcher the options registered for that event.
   *
   * With {@link ScriptOptions.sparseHooks}, the input and the tool use id are dropped: only the
   * fields the SDK guarantees reach the hook.
   */
  private async fire(
    event: 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit',
    input: Record<string, unknown>,
    toolUseId?: string,
  ): Promise<void> {
    const matchers: readonly HookCallbackMatcher[] = this.options.hooks?.[event] ?? [];
    const sparse = this.script.sparseHooks === true;
    const fields = sparse ? {} : input;
    const id = sparse ? undefined : toolUseId;

    for (const matcher of matchers) {
      for (const hook of matcher.hooks) {
        await hook({ hook_event_name: event, session_id: 'scripted', ...fields } as never, id, {
          signal: new AbortController().signal,
        });
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

  setPermissionMode(mode: string): Promise<void> {
    this.record.modes.push(mode);
    return Promise.resolve();
  }

  /**
   * The installation's commands, as recorded from a real one.
   *
   * Answered with no prompt at all, as the real CLI does: the list comes from the initialisation of
   * the subprocess, and nothing is said to the model.
   */
  supportedCommands(): Promise<SlashCommand[]> {
    this.record.commandCalls += 1;
    const commands = this.script.commands;

    if (commands === 'hang') {
      return new Promise<SlashCommand[]>(() => undefined);
    }
    if (commands instanceof Error) {
      return Promise.reject(commands);
    }

    return Promise.resolve([...(commands ?? loadCommands().commands)]);
  }

  /**
   * The installation's models, as recorded from a real one (`installation.json`).
   *
   * Answered with no prompt, like the commands: a control request of the subprocess.
   */
  supportedModels(): Promise<ModelInfo[]> {
    return this.installation('models', () => loadInstallation().models);
  }

  /** The use of the context window, as recorded — or as the script says. */
  getContextUsage(): Promise<SDKControlGetContextUsageResponse> {
    return this.installation('contextUsage', () => loadInstallation().contextUsage);
  }

  /** The MCP servers: none were configured where the recording ran, so a script names them. */
  mcpServerStatus(): Promise<McpServerStatus[]> {
    return this.installation('mcpServers', () => [
      ...(this.script.mcpServers ?? loadInstallation().mcpServers),
    ]);
  }

  /** One answer about the installation, or the failure the script asks for. */
  private installation<T>(what: keyof InstallationFixture, answer: () => T): Promise<T> {
    this.record.installationCalls[what] += 1;
    const failure = this.script.installationFails;

    if (failure === 'hang') {
      return new Promise<T>(() => undefined);
    }
    if (failure instanceof Error) {
      return Promise.reject(failure);
    }

    return Promise.resolve(answer());
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
    commandCalls: 0,
    installationCalls: { models: 0, mcpServers: 0, contextUsage: 0 },
    options: null,
    modes: [],
  };

  return {
    record,
    createQuery: (params) =>
      new ScriptedQuery(params.prompt, params.options, script, record) as unknown as Query,
  };
}
