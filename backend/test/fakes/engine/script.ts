import type { TestTool } from './test-tool-classifier';

/**
 * One step of a scripted turn: the agent answering in text, or calling one native tool.
 *
 * This is the engine's own minimal replay format (plan 28, B-43) — there is no external wire format
 * to mimic the way `scripted-query.ts` mimics the Agent SDK's, so a test author says "this turn calls
 * `write_file` then answers with text" directly, with {@link toolStep} and {@link textStep}, instead
 * of building an SDK-message-shaped fixture.
 */
export type ScriptedStep =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'tool';
      readonly name: TestTool;
      readonly input: Readonly<Record<string, unknown>>;
      /** What the tool "returns" once the gate allows it to run — always scripted, never computed. */
      readonly summary?: string;
    };

/** One step: the agent answers with [value]. */
export function textStep(value: string): ScriptedStep {
  return { kind: 'text', text: value };
}

/** One step: the agent calls the native tool [name] with [input]. */
export function toolStep(
  name: TestTool,
  input: Readonly<Record<string, unknown>>,
  summary?: string,
): ScriptedStep {
  return { kind: 'tool', name, input, ...(summary === undefined ? {} : { summary }) };
}

/** One turn: its steps, in order, and whether it holds once they are done. */
export interface ScriptedTurn {
  readonly steps: readonly ScriptedStep[];

  /**
   * Mirrors the scripted SDK fake's `[hold]` tag: a held turn runs none of its steps and produces no
   * `turn.completed` on its own — it sits exactly as a long-running tool would, until
   * `session.interrupt` ends it (the contract suite's own interrupt scenario, S-120).
   */
  readonly holds?: boolean;
}

/** A turn of [steps], held when [holds] — `false` unless a test says otherwise. */
export function turn(steps: readonly ScriptedStep[], holds = false): ScriptedTurn {
  return { steps, holds };
}

/**
 * A script: every named turn a session of the test engine may replay.
 *
 * A prompt may ask for one by name with `[fixture:<name>]`, the same tag the scripted SDK fake
 * answers to (`scripted-query.ts`'s `FIXTURE_TAG`) — so a suite that drives both engines through one
 * running stack reads the same way for either (plan 01, S-123's own reason for the tag).
 */
export type TestEngineScript = Readonly<Record<string, ScriptedTurn>>;

/** `[fixture:tool-turn]` — the turn a prompt asks for, by name. */
const FIXTURE_TAG = /\[fixture:([a-z0-9-]+)\]/i;

/** The name of the turn a prompt asked for, or `null` when it asked for none. */
export function fixtureNamedIn(promptText: string): string | null {
  return FIXTURE_TAG.exec(promptText)?.[1] ?? null;
}

/**
 * The turns every suite can reach for by name, without writing its own script — one per shape of
 * turn the port contract suite needs: plain text, a file write, a shell call, a question, and one
 * that holds until interrupted.
 */
const TOOL_TURN_STEPS = [
  toolStep('write_file', { path: 'notes.txt', content: 'hello\n' }, 'wrote notes.txt'),
  textStep('Wrote it.'),
];

export const TEST_SCRIPTS: TestEngineScript = {
  'text-turn': turn([textStep('All set.')]),
  'tool-turn': turn(TOOL_TURN_STEPS),
  'shell-turn': turn([toolStep('run_shell', { command: 'echo hi' }, 'hi'), textStep('Ran it.')]),
  'question-turn': turn([
    toolStep('ask_user', {
      header: 'Which?',
      prompt: 'Which file should I touch?',
      options: ['a.txt', 'b.txt'],
    }),
  ]),
  // Text only, deliberately — the same choice the WS suites make for a held turn
  // (`session-panel.spec.ts` holds `text-turn`, never `tool-turn`): the one message plays, moving
  // the derived status to `thinking`, and only the turn's own completion waits for
  // `session.interrupt`. The same shape the scripted SDK fake's `[hold]` tag gives Claude over its
  // own `text-turn`, so the port contract suite's interrupt scenario (S-120) reads the same way for
  // either engine.
  'held-turn': turn([textStep('Working on it.')], true),
};

/**
 * The turn [promptText] asks for, from [script] — its own `[fixture:…]` tag, or [fallback] when it
 * names none.
 *
 * @throws {Error} neither the named turn nor [fallback] is in [script] — a script that does not cover
 *   what a test asked of it, caught the moment it is asked rather than as a silent `undefined`
 */
export function turnFor(
  script: TestEngineScript,
  promptText: string,
  fallback: string,
): ScriptedTurn {
  const named = fixtureNamedIn(promptText);
  const found = script[named ?? fallback] ?? script[fallback];

  if (found === undefined) {
    throw new Error(`the test engine's script has no turn named "${named ?? fallback}"`);
  }

  return found;
}
