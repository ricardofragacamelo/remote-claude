import { describe, expect, it } from 'vitest';

import { CLAUDE_TOOLS } from '@adapter/outbound/engines/claude/tool-classifier';
import { classifyRisk } from '@domain/permission';
import type { RiskHint } from '@domain/permission';
import { claudeTool } from '../../../../support/builders/tool.builder';

/**
 * The per-name classifier the risk had before plan 28 · F2, kept here as the oracle: its two lists
 * and its shell rule, verbatim (`git show 925fdc4:backend/src/domain/permission/services/risk.classifier.ts`).
 * The grading of a shell line did not change, so the oracle hands a line to the current one.
 */
const OLD_READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'NotebookRead',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'TaskCreate',
  'TaskGet',
  'TaskUpdate',
  'TaskList',
  'Task',
  'BashOutput',
  'AskUserQuestion',
]);
const OLD_WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const OLD_SHELL_TOOLS = new Set(['Bash', 'BashTool']);

function oldRisk(toolName: string, input: Readonly<Record<string, unknown>>): RiskHint {
  if (OLD_READ_ONLY_TOOLS.has(toolName)) {
    return 'read';
  }
  if (OLD_WRITING_TOOLS.has(toolName)) {
    return 'write';
  }
  if (!OLD_SHELL_TOOLS.has(toolName)) {
    return 'destructive';
  }
  const command = input['command'];
  return typeof command === 'string'
    ? classifyRisk({ kind: 'shell', subject: { command } })
    : 'destructive';
}

/** An input of each tool shaped as Claude Code sends it — what the classifier reads its kind from. */
const SAMPLES: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {
  Read: [{ file_path: '/srv/app/a.ts', offset: 1, limit: 2 }],
  NotebookRead: [{ notebook_path: '/srv/app/n.ipynb' }],
  Write: [{ file_path: '/srv/app/a.ts', content: 'x' }, { file_path: 'relative.ts' }],
  Edit: [{ file_path: '/srv/app/a.ts', old_string: 'a', new_string: 'b' }],
  MultiEdit: [{ file_path: '/srv/app/a.ts', edits: [{ old_string: 'a', new_string: 'b' }] }],
  NotebookEdit: [{ notebook_path: '/srv/app/n.ipynb', new_source: 'x' }],
  Bash: [
    { command: 'ls -la' },
    { command: 'git status' },
    { command: 'mkdir out' },
    { command: 'rm -rf build/' },
    { command: 'ls && rm -rf build' },
    { command: 'echo $(whoami)' },
    { command: '' },
    { description: 'no command at all' },
  ],
  BashOutput: [{ bash_id: 'b1' }],
  Glob: [{ pattern: '**/*.ts' }],
  Grep: [{ pattern: 'TODO' }, { pattern: 'TODO', path: '/srv/app' }],
  WebFetch: [{ url: 'https://example.com', prompt: 'read' }],
  WebSearch: [{ query: 'vitest' }],
  TodoWrite: [{ todos: [] }],
  TaskCreate: [{ subject: 'Ship it' }],
  TaskUpdate: [{ taskId: '1', status: 'completed' }],
  TaskGet: [{ taskId: '1' }],
  TaskList: [{}],
  Agent: [{ description: 'look around', subagent_type: 'Explore', prompt: 'go' }],
  AskUserQuestion: [{ questions: [{ question: 'Which?', header: 'Pick', options: [] }] }],
  ExitPlanMode: [{ plan: '1. do it' }],
};

/** Every name the table of Claude Code has, an MCP tool, and a name nobody has. */
const NAMES = [...CLAUDE_TOOLS, 'mcp__srv__x', 'NotAToolAnybodyHas'].filter(
  (name) => name !== 'Task',
);

/**
 * S-49: the risk by the kind is the risk by the name, for every tool the product knows — the move of
 * plan 28 · B-16 changes where the rule reads, never what it answers.
 */
describe('the risk by kind, against the risk by name — plan 28, S-49', () => {
  const cases = NAMES.flatMap((name) =>
    (SAMPLES[name] ?? [{}, { anything: true }]).map((input) => [name, input] as const),
  );

  it.each(cases)('grades %s %j as it always did', (name, input) => {
    expect(classifyRisk(claudeTool(name, input))).toBe(oldRisk(name, input));
  });

  it('covers every tool of the table', () => {
    // A name added to the table is graded here without a line to add: the parity holds by default.
    expect(new Set(cases.map(([name]) => name))).toEqual(new Set(NAMES));
  });

  it('grades `Task` as a subagent now, which asks — the one intended difference (plan 28, D-29)', () => {
    // `Task` is what the subagent tool was called before the SDK named it `Agent`, and the old
    // list graded it a read only because it was mistaken for the task list. It is `agent` now,
    // `destructive` as `Agent` always was: one more confirmation, never one fewer.
    const input = { description: 'look around', subagent_type: 'Explore', prompt: 'go' };

    expect(oldRisk('Task', input)).toBe('read');
    expect(claudeTool('Task', input).kind).toBe('agent');
    expect(classifyRisk(claudeTool('Task', input))).toBe('destructive');
    expect(classifyRisk(claudeTool('Agent', input))).toBe(oldRisk('Agent', input));
  });
});
