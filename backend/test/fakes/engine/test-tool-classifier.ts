import type {
  CanonicalTool,
  FileChange,
  Question,
  QuestionInteraction,
  ToolKind,
  ToolLabel,
  ToolSubject,
} from '@domain/engine';
import { TEST_ENGINE } from './test-engine';

type Input = Readonly<Record<string, unknown>>;

/** What a tool is, but where it came from: the adapter adds the origin — Claude's own shape. */
type Classified = Omit<CanonicalTool, 'origin'>;

/** How one native tool of the test engine becomes a canonical one, from its input and the folder. */
type Classify = (input: Input, folder: string) => Classified;

function field(input: Input, name: string): string {
  const value = input[name];
  return typeof value === 'string' ? value : '';
}

/**
 * [path] relative to [folder] — the same rule Claude's own classifier shows a label by
 * (`relativeTo` of `tool-classifier.ts`), kept as its own copy here on purpose: this fake must never
 * depend on Claude's adapter changing underneath it.
 */
export function relativeTo(folder: string, path: string): string {
  return folder !== '' && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path;
}

/**
 * [path] resolved against [folder] when it is not already absolute.
 *
 * Unlike Claude's CLI, this fake's own native tools are free to take a relative path — there is no
 * external process whose contract fixes the shape — so resolving it here, rather than refusing it
 * the way `changeAt` of Claude's classifier does, is this engine's own rule.
 */
function resolved(folder: string, path: string): string {
  return path.startsWith('/') ? path : `${folder}/${path}`;
}

function label(messageKey: string, params: ToolLabel['params'] = {}): ToolLabel {
  return { messageKey, params };
}

/** How many lines [text] has: none for empty text. */
function lines(text: string): number {
  return text === '' ? 0 : text.split('\n').length;
}

/** The first line of a command — what a row of the conversation shows. */
function firstLine(text: string): string {
  const end = text.indexOf('\n');
  return end === -1 ? text : text.slice(0, end);
}

/** Builds a canonical tool of [kind]. */
function tool(
  kind: ToolKind,
  messageKey: string,
  params: ToolLabel['params'],
  subject: ToolSubject = {},
  changes: readonly FileChange[] = [],
): Classified {
  return { kind, label: label(messageKey, params), subject, changes };
}

/**
 * `write_file`: `{ path, content }` — the only file tool this engine has, so it is also the only one
 * that ever touches `changes` (what the undo and the diff preview key on, ADR-013).
 */
const writeFile: Classify = (input, folder) => {
  const path = field(input, 'path');
  const content = field(input, 'content');
  const absolute = resolved(folder, path);

  return tool(
    'file.write',
    'sessions.tool.fileWrite',
    { path: relativeTo(folder, absolute), lines: lines(content) },
    { paths: [absolute] },
    [{ path: absolute, op: 'write', content }],
  );
};

/** `run_shell`: `{ command }` — this engine's own name for a shell call. */
const runShell: Classify = (input) => {
  const command = field(input, 'command');
  return tool('shell', 'sessions.tool.shell', { command: firstLine(command) }, { command });
};

/** The options of an `ask_user` call, kept as the strings the agent wrote — never more than one each. */
function optionsOf(input: Input): readonly string[] {
  const raw = input['options'];
  return Array.isArray(raw)
    ? raw.filter((option): option is string => typeof option === 'string')
    : [];
}

/** One question of `ask_user`, normalised the way every question-asking engine's is (plan 24). */
function questionOf(input: Input): Question {
  const prompt = field(input, 'prompt');
  const options = optionsOf(input);

  return {
    id: 'q1',
    header: field(input, 'header'),
    prompt,
    originalPrompt: prompt,
    multiSelect: input['multiSelect'] === true,
    options: options.map((option) => ({
      label: option,
      description: '',
      preview: null,
      originalLabel: option,
    })),
  };
}

/**
 * `ask_user`: `{ header, prompt, options, multiSelect? }` — this engine's one interactive tool,
 * always a single question (the `questions` capability has nothing to gain from more than one here).
 */
const askUser: Classify = (input) => {
  const question = questionOf(input);
  const interaction: QuestionInteraction = {
    kind: 'question',
    malformed: false,
    questions: [question],
  };

  return {
    ...tool('question', 'sessions.tool.question', { header: question.header }),
    interaction,
  };
};

/**
 * Every native tool of the test engine (plan 28, B-43) — other names than Claude's, by the task's
 * own text.
 */
export const TEST_TOOLS = ['write_file', 'run_shell', 'ask_user'] as const;

export type TestTool = (typeof TEST_TOOLS)[number];

/**
 * A `Record` over the union, so a name added to {@link TEST_TOOLS} without a classification does not
 * compile — the same guarantee `CLASSIFY` of Claude's own classifier gives.
 */
const CLASSIFY: Readonly<Record<TestTool, Classify>> = {
  write_file: writeFile,
  run_shell: runShell,
  ask_user: askUser,
};

function isTestTool(name: string): name is TestTool {
  return Object.hasOwn(CLASSIFY, name);
}

/** A tool the core has no kind for: the generic line, with the engine's own name as its text. */
function other(name: string): Classified {
  return tool('other', 'sessions.tool.other', { name });
}

/**
 * [name] and [input] of a call of the test engine, as the core reads it: its canonical kind, label,
 * subject and changes, and where it came from. Exhaustive over {@link TEST_TOOLS}; a name the table
 * does not have is `other` — the same generic path an unknown Claude tool takes (R-01), proving this
 * fake's robustness is nothing special to it.
 *
 * @param folder the folder of the session — what the label's paths are relative to
 */
export function classifyTestTool(name: string, input: Input, folder: string): CanonicalTool {
  const origin = { engine: TEST_ENGINE, native: name };
  return { ...(isTestTool(name) ? CLASSIFY[name](input, folder) : other(name)), origin };
}
