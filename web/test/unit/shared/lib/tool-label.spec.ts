import { afterEach, describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n, nameAgents } from '@/shared/i18n';
import {
  isKnownKind,
  kindKeyOf,
  kindShortName,
  permissionTitle,
  toolLabelText,
  toolLine,
} from '@/shared/lib/tool-label';
import type { LabelledTool } from '@/shared/lib/tool-label';
import { aToolCall } from '../../../support/canonical-tool';

const FOLDER = '/home/dev/project';

const en = createI18n('en').t as TFunction;
const pt = createI18n('pt-BR').t as TFunction;

/** The line of a call of [name], as the backend labels it, translated. */
const lineOf = (name: string, input: Record<string, unknown>, title?: string, t: TFunction = en) =>
  toolLine({ ...aToolCall(name, input, FOLDER), title }, t);

/** A call the backend describes with [kind] and [messageKey] — whatever this build knows of them. */
const raw = (
  kind: string,
  messageKey: string,
  params: Record<string, string | number> = {},
  title?: string,
): LabelledTool => ({ kind, label: { messageKey, params }, title });

afterEach(() => {
  nameAgents(null);
});

/**
 * The row of each tool says what it said before the label moved to the backend — the same words,
 * from the server's label (plan 28, S-55). `Bash` reads "Shell:" now, deliberately.
 */
describe('the line of each tool, from the label the server built — plan 28 S-55', () => {
  it.each([
    ['Read', { file_path: `${FOLDER}/src/a.ts` }, 'Read src/a.ts'],
    [
      'Edit',
      { file_path: `${FOLDER}/src/a.ts`, old_string: 'a', new_string: 'b\nc\nd' },
      'Edit src/a.ts (+3 −1)',
    ],
    [
      'Write',
      { file_path: '/elsewhere/out.txt', content: '' },
      'Write /elsewhere/out.txt (0 lines)',
    ],
    ['MultiEdit', { file_path: `${FOLDER}/m.ts` }, 'Edit m.ts (several changes)'],
    ['NotebookEdit', { notebook_path: `${FOLDER}/n.ipynb` }, 'Edit the notebook n.ipynb'],
    ['Bash', { command: 'pnpm test\n  --watch' }, 'Shell: pnpm test'],
    ['BashOutput', { bash_id: '1' }, 'Read the output of a command'],
    ['Grep', { pattern: 'TODO' }, 'Search for “TODO”'],
    ['Grep', { pattern: 'TODO', path: `${FOLDER}/src` }, 'Search for “TODO” in src'],
    ['Glob', { pattern: '**/*.ts' }, 'Find files **/*.ts'],
    ['WebFetch', { url: 'https://docs.example.com/a?b=1' }, 'Fetch docs.example.com'],
    ['WebSearch', { query: 'vitest' }, 'Search the web for “vitest”'],
    [
      'Agent',
      { description: 'look around', subagent_type: 'Explore' },
      'Subagent (Explore): look around',
    ],
    ['Task', { description: 'old name' }, 'Subagent (general-purpose): old name'],
    ['AskUserQuestion', { questions: [{ header: 'Library' }] }, 'Asked: Library'],
    ['AskUserQuestion', { questions: [{}, {}, {}] }, 'Asked 3 questions'],
    ['ExitPlanMode', { plan: '# plan' }, 'Present the plan'],
    ['TodoWrite', { todos: [{}, {}] }, 'Updated the task list (2 tasks)'],
    ['TaskCreate', { subject: 'Ship it' }, 'Added a task: Ship it'],
    ['TaskUpdate', { taskId: '3' }, 'Changed task #3'],
    ['TaskGet', { taskId: '3' }, 'Read task #3'],
    ['TaskList', {}, 'Read the task list'],
    ['mcp__github__create_issue', {}, 'github · create_issue'],
    ['Frobnicate', { a: 1 }, 'Frobnicate'],
  ])('labels %s — %s', (name, input, text) => {
    expect(lineOf(name, input)).toEqual({ text, detail: null });
  });

  it('speaks the language of the screen', () => {
    expect(lineOf('Bash', { command: 'ls' }, undefined, pt).text).toBe('Shell: ls');
    expect(lineOf('Read', { file_path: `${FOLDER}/a.ts` }, undefined, pt).text).toBe('Ler a.ts');
    expect(lineOf('Agent', { description: 'd' }, undefined, pt).text).toBe(
      'Subagente (general-purpose): d',
    );
  });
});

/** The tool by the description the model gave the call — plan 22, B-29 (D-05). */
describe('the line of a call with a title — plan 22 B-29, plan 28 S-55', () => {
  it('is the short name of the kind and the title, with the label as the detail — S-111', () => {
    expect(lineOf('Bash', { command: 'pnpm test\n--watch' }, 'Run the tests')).toEqual({
      text: 'Shell · Run the tests',
      detail: 'Shell: pnpm test',
    });
    expect(lineOf('Read', { file_path: `${FOLDER}/a.ts` }, 'Look').text).toBe('Read file · Look');
    expect(lineOf('MultiEdit', { file_path: `${FOLDER}/a.ts` }, 'Fix').text).toBe(
      'Edit file · Fix',
    );
    expect(lineOf('Bash', { command: 'ls' }, 'Listar', pt).text).toBe('Shell · Listar');
  });

  it('is the line of today without a title, or with a blank one — S-111', () => {
    expect(lineOf('Bash', { command: 'ls' })).toEqual({ text: 'Shell: ls', detail: null });
    expect(lineOf('Bash', { command: 'ls' }, '   ')).toEqual({ text: 'Shell: ls', detail: null });
  });

  it('names an MCP tool and a tool of kind `other` by their label', () => {
    expect(lineOf('mcp__github__create_issue', {}, 'Open the issue').text).toBe(
      'github · create_issue · Open the issue',
    );
    expect(lineOf('Frobnicate', {}, 'Do it').text).toBe('Frobnicate · Do it');
  });

  it('keeps a subagent its own line, which says the description and the kind', () => {
    expect(
      lineOf('Agent', { description: 'Find it', subagent_type: 'Explore' }, 'Find it'),
    ).toEqual({ text: 'Subagent (Explore): Find it', detail: null });
  });

  it('names an unknown kind by its generic line', () => {
    expect(
      toolLine(raw('vcs.commit', 'sessions.tool.vcsCommit', { name: 'commit' }, 'Save'), en),
    ).toEqual({ text: 'commit · Save', detail: 'commit' });
  });
});

/** A kind or a key this build does not know is the generic line, never an error — plan 28 S-56. */
describe('the generic line — plan 28 S-56', () => {
  it('draws an unknown kind by the name its label carries, or by the kind', () => {
    expect(
      toolLabelText(raw('vcs.commit', 'sessions.tool.other', { name: 'git_commit' }), en),
    ).toBe('git_commit');
    expect(toolLabelText(raw('vcs.commit', 'sessions.tool.fileRead', { path: 'a' }), en)).toBe(
      'vcs.commit',
    );
  });

  it('draws a known kind with a key this build does not have as the generic line', () => {
    expect(toolLabelText(raw('shell', 'sessions.tool.shellRemote', { command: 'ls' }), en)).toBe(
      'shell',
    );
    expect(toolLabelText(raw('other', 'sessions.tool.brandNew', { name: 'Thing' }), en)).toBe(
      'Thing',
    );
  });

  it('never translates a key outside the row labels, nor one with no key at all', () => {
    expect(toolLabelText(raw('shell', 'common.action.retry'), en)).toBe('shell');
    expect(toolLabelText(raw('shell', ''), en)).toBe('shell');
    expect(toolLabelText(raw('other', 'sessions.tool', { name: 'X' }), en)).toBe('X');
  });

  it('reads a name that is not text as absent', () => {
    expect(toolLabelText(raw('nope', 'sessions.tool.other', { name: 42 }), en)).toBe('nope');
  });
});

describe('the keys of a kind', () => {
  it.each([
    ['file.edit', 'fileEdit'],
    ['shell.output', 'shellOutput'],
    ['web.fetch', 'webFetch'],
    ['shell', 'shell'],
    ['a.b.c', 'aBC'],
  ])('turns %s into %s', (kind, key) => {
    expect(kindKeyOf(kind)).toBe(key);
  });

  it('knows the kinds of the contract, and no other', () => {
    expect(isKnownKind('file.move')).toBe(true);
    expect(isKnownKind('tasks')).toBe(true);
    expect(isKnownKind('fileMove')).toBe(false);
    expect(isKnownKind('')).toBe(false);
  });
});

describe('what a permission request asks, by its kind — plan 28 S-55', () => {
  it.each([
    ['Bash', { command: 'ls' }, 'Run a shell command'],
    ['Write', { file_path: '/a' }, 'Write a file'],
    ['Edit', { file_path: '/a' }, 'Edit a file'],
    ['MultiEdit', { file_path: '/a' }, 'Edit a file'],
    ['NotebookEdit', { notebook_path: '/a' }, 'Edit a file'],
    ['Read', { file_path: '/a' }, 'Read a file'],
    ['WebFetch', { url: 'https://x.dev' }, 'Fetch a page'],
    ['WebSearch', { query: 'q' }, 'Search the web'],
    ['Grep', { pattern: 'x' }, 'Search the files'],
    ['BashOutput', {}, "Read a command's output"],
    ['Agent', {}, 'Start a subagent'],
    ['ExitPlanMode', {}, 'Approve the plan'],
    ['TodoWrite', {}, 'Change the task list'],
    ['mcp__github__create_issue', {}, 'Use an MCP tool'],
    ['Frobnicate', {}, 'Use a tool'],
  ])('asks about %s as %s', (name, input, text) => {
    expect(permissionTitle(aToolCall(name, input), en)).toBe(text);
  });

  it('names the agent of a question by the engine of the call', () => {
    nameAgents({ defaultEngine: 'claude', engines: [{ id: 'claude', displayName: 'Claude' }] });

    expect(permissionTitle(aToolCall('AskUserQuestion', { questions: [] }), en)).toBe(
      "Answer Claude's question",
    );
    expect(permissionTitle(aToolCall('AskUserQuestion', { questions: [] }), pt)).toBe(
      'Responder à pergunta do Claude',
    );
  });

  it('shows the translated label for a kind this build has no words for', () => {
    const tool = {
      ...raw('vcs.commit', 'sessions.tool.other', { name: 'commit' }),
      origin: { engine: 'x', native: 'commit' },
    };

    expect(permissionTitle(tool, en)).toBe('commit');
  });
});

describe('the short name of the kind a rule answers — plan 28 F5', () => {
  it('is the short name of a kind this build knows, in the language of the screen', () => {
    expect(kindShortName('shell', en)).toBe('Shell');
    expect(kindShortName('file.edit', en)).toBe('Edit file');
    expect(kindShortName('web.fetch', pt)).toBe('Página');
  });

  it('is the generic name for a kind it does not know, for none, and for a name of the object', () => {
    expect(kindShortName('vcs.commit', en)).toBe('Tool');
    expect(kindShortName(null, en)).toBe('Tool');
    expect(kindShortName('toString', pt)).toBe('Ferramenta');
  });
});
