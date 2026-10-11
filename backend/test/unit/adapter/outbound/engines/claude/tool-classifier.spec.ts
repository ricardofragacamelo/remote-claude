import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CLAUDE_TOOLS,
  classifyTool,
  relativeTo,
} from '@adapter/outbound/engines/claude/tool-classifier';

const FOLDER = '/srv/app';
const classify = (name: string, input: Record<string, unknown> = {}) =>
  classifyTool(name, input, FOLDER);

describe('the classifier of the tools of Claude Code — plan 28, B-14', () => {
  it.each([
    [
      'Read',
      { file_path: '/srv/app/a.ts' },
      'file.read',
      'sessions.tool.fileRead',
      { path: 'a.ts' },
      { paths: ['/srv/app/a.ts'] },
    ],
    [
      'NotebookRead',
      { notebook_path: '/srv/app/n.ipynb' },
      'file.read',
      'sessions.tool.fileRead',
      { path: 'n.ipynb' },
      { paths: ['/srv/app/n.ipynb'] },
    ],
    [
      'Write',
      { file_path: '/srv/app/a.ts', content: 'a\nb' },
      'file.write',
      'sessions.tool.fileWrite',
      { path: 'a.ts', lines: 2 },
      { paths: ['/srv/app/a.ts'] },
    ],
    [
      'Edit',
      { file_path: '/srv/app/a.ts', old_string: 'a', new_string: 'b\nc' },
      'file.edit',
      'sessions.tool.fileEdit',
      { path: 'a.ts', added: 2, removed: 1 },
      { paths: ['/srv/app/a.ts'] },
    ],
    [
      'NotebookEdit',
      { notebook_path: '/srv/app/n.ipynb' },
      'file.edit',
      'sessions.tool.fileEditCell',
      { path: 'n.ipynb' },
      { paths: ['/srv/app/n.ipynb'] },
    ],
    [
      'Bash',
      { command: 'npm test\nmore' },
      'shell',
      'sessions.tool.shell',
      { command: 'npm test' },
      { command: 'npm test\nmore' },
    ],
    ['BashOutput', {}, 'shell.output', 'sessions.tool.shellOutput', {}, {}],
    [
      'Grep',
      { pattern: 'x' },
      'search',
      'sessions.tool.search',
      { pattern: 'x' },
      { pattern: 'x' },
    ],
    [
      'Grep',
      { pattern: 'x', path: '/srv/app/src' },
      'search',
      'sessions.tool.searchIn',
      { pattern: 'x', path: 'src' },
      { pattern: 'x', paths: ['/srv/app/src'] },
    ],
    [
      'Glob',
      { pattern: '**/*.ts' },
      'search',
      'sessions.tool.searchFiles',
      { pattern: '**/*.ts' },
      { pattern: '**/*.ts' },
    ],
    [
      'WebFetch',
      { url: 'https://example.com/a' },
      'web.fetch',
      'sessions.tool.webFetch',
      { host: 'example.com' },
      { url: 'https://example.com/a' },
    ],
    [
      'WebFetch',
      { url: 'not a url' },
      'web.fetch',
      'sessions.tool.webFetch',
      { host: 'not a url' },
      { url: 'not a url' },
    ],
    [
      'WebSearch',
      { query: 'q' },
      'web.search',
      'sessions.tool.webSearch',
      { query: 'q' },
      { query: 'q' },
    ],
    [
      'Agent',
      { description: 'look', subagent_type: 'explore' },
      'agent',
      'sessions.tool.agent',
      { description: 'look', type: 'explore' },
      { description: 'look' },
    ],
    ['Task', {}, 'agent', 'sessions.tool.agent', { description: '', type: 'general-purpose' }, {}],
    [
      'AskUserQuestion',
      { questions: [{ header: 'Which?' }] },
      'question',
      'sessions.tool.question',
      { header: 'Which?' },
      {},
    ],
    [
      'AskUserQuestion',
      { questions: [{ header: 'A' }, { header: 'B' }] },
      'question',
      'sessions.tool.questions',
      { count: 2 },
      {},
    ],
    [
      'AskUserQuestion',
      { questions: ['loose'] },
      'question',
      'sessions.tool.questions',
      { count: 1 },
      {},
    ],
    ['ExitPlanMode', {}, 'plan', 'sessions.tool.plan', {}, {}],
    ['TodoWrite', { todos: [{}, {}] }, 'tasks', 'sessions.tool.tasksWrite', { count: 2 }, {}],
    ['TodoWrite', {}, 'tasks', 'sessions.tool.tasksWrite', { count: 0 }, {}],
    ['TaskCreate', { subject: 'do' }, 'tasks', 'sessions.tool.taskCreate', { subject: 'do' }, {}],
    ['TaskUpdate', { taskId: '1' }, 'tasks', 'sessions.tool.taskUpdate', { id: '1' }, {}],
    ['TaskGet', { taskId: '1' }, 'tasks', 'sessions.tool.taskGet', { id: '1' }, {}],
    ['TaskList', {}, 'tasks', 'sessions.tool.taskList', {}, {}],
  ])(
    'classifies %s as the core reads it — S-41',
    (name, input, kind, messageKey, params, subject) => {
      const tool = classify(name, input);

      expect(tool).toMatchObject({ kind, label: { messageKey, params }, subject });
      expect(tool.origin).toEqual({ engine: 'claude', native: name });
    },
  );

  it('says what an edit, a multiple edit and a write change, for the undo and the diff', () => {
    expect(
      classify('Edit', {
        file_path: '/srv/app/a.ts',
        old_string: 'a',
        new_string: 'b',
        replace_all: true,
      }).changes,
    ).toEqual([
      {
        path: '/srv/app/a.ts',
        op: 'edit',
        edits: [{ oldText: 'a', newText: 'b', replaceAll: true }],
      },
    ]);
    expect(
      classify('MultiEdit', {
        file_path: '/srv/app/a.ts',
        edits: [
          { old_string: 'a', new_string: 'b\nc' },
          { old_string: 'd\ne', new_string: '', replace_all: true },
          'loose',
        ],
      }),
    ).toMatchObject({
      kind: 'file.edit',
      // Several replacements say no one count: the label names the file alone (plan 28, F2).
      label: { messageKey: 'sessions.tool.fileEditMany', params: { path: 'a.ts' } },
      changes: [
        {
          path: '/srv/app/a.ts',
          op: 'edit',
          edits: [
            { oldText: 'a', newText: 'b\nc' },
            { oldText: 'd\ne', newText: '', replaceAll: true },
          ],
        },
      ],
    });
    expect(classify('Write', { file_path: '/srv/app/a.ts', content: 'x' }).changes).toEqual([
      { path: '/srv/app/a.ts', op: 'write', content: 'x' },
    ]);
    expect(classify('NotebookEdit', { notebook_path: '/srv/app/n.ipynb' }).changes).toEqual([
      { path: '/srv/app/n.ipynb', op: 'edit' },
    ]);
  });

  it('labels a multiple edit by its file alone, never with a count of lines', () => {
    expect(
      classify('MultiEdit', { file_path: '/srv/app/a.ts', edits: [{ old_string: 'a' }] }).label,
    ).toEqual({ messageKey: 'sessions.tool.fileEditMany', params: { path: 'a.ts' } });
  });

  it('changes nothing for a relative path, and nothing for a tool that writes no file', () => {
    // A relative path would be resolved against the backend's folder, not the session's: better no
    // change than the undo of the wrong file (ADR-013) — the rule `file-tools.ts` had.
    expect(classify('Write', { file_path: 'a.ts', content: 'x' }).changes).toEqual([]);
    expect(classify('Edit', { file_path: 'src/a.ts', old_string: 'a' }).changes).toEqual([]);
    expect(classify('MultiEdit', { file_path: './a.ts', edits: [] }).changes).toEqual([]);
    expect(classify('NotebookEdit', { notebook_path: 'n.ipynb' }).changes).toEqual([]);
    expect(classify('Bash', { command: 'rm -rf x' }).changes).toEqual([]);
    expect(classify('Read', { file_path: '/srv/app/a.ts' }).changes).toEqual([]);
    expect(classify('mcp__fs__write_file', { path: '/srv/app/a.ts' }).changes).toEqual([]);
    expect(classify('BrandNewTool', { file_path: '/srv/app/a.ts' }).changes).toEqual([]);
  });

  it('reads the notebook a cell edit changes from `notebook_path`, not from `file_path`', () => {
    expect(
      classify('NotebookEdit', { notebook_path: '/srv/app/n.ipynb', file_path: '/srv/app/x' }),
    ).toMatchObject({
      subject: { paths: ['/srv/app/n.ipynb'] },
      changes: [{ path: '/srv/app/n.ipynb', op: 'edit' }],
    });
  });

  it('says which part of a file a read reads — its window (plan 28, D-31)', () => {
    expect(classify('Read', { file_path: '/srv/app/a.ts', offset: 10, limit: 20 }).subject).toEqual(
      { paths: ['/srv/app/a.ts'], window: { offset: 10, limit: 20 } },
    );
    expect(classify('Read', { file_path: '/srv/app/a.pdf', pages: '1-3' }).subject).toEqual({
      paths: ['/srv/app/a.pdf'],
      window: { pages: '1-3' },
    });
    // An offset of zero is a place; a field of the wrong type is no window at all.
    expect(classify('Read', { file_path: '/a', offset: 0 }).subject.window).toEqual({ offset: 0 });
    expect(
      classify('Read', { file_path: '/a', offset: '10', limit: null, pages: 3 }).subject,
    ).toEqual({ paths: ['/a'] });
  });

  it('survives an edit without its texts and a multiple edit with none — S-44', () => {
    expect(classify('Edit', { file_path: '/srv/app/a.ts' })).toMatchObject({
      label: { params: { added: 0, removed: 0 } },
      changes: [{ path: '/srv/app/a.ts', op: 'edit', edits: [{ oldText: '', newText: '' }] }],
    });
    expect(classify('MultiEdit', { file_path: '/srv/app/a.ts', edits: [] }).changes).toEqual([
      { path: '/srv/app/a.ts', op: 'edit', edits: [] },
    ]);
    expect(classify('MultiEdit', {}).changes).toEqual([]);
    expect(classify('Read').subject).toEqual({});
  });

  it('draws a name outside the table as the generic line, with the name as its text — S-42', () => {
    expect(classify('BrandNewTool', { anything: 1 })).toEqual({
      kind: 'other',
      label: { messageKey: 'sessions.tool.other', params: { name: 'BrandNewTool' } },
      subject: {},
      changes: [],
      origin: { engine: 'claude', native: 'BrandNewTool' },
    });
    expect(classify('Monitor').kind).toBe('other');
  });

  it('reads an MCP tool by its server and tool, and a malformed one as other — S-43', () => {
    expect(classify('mcp__fixture__echo')).toMatchObject({
      kind: 'mcp',
      label: { messageKey: 'sessions.tool.mcp', params: { server: 'fixture', tool: 'echo' } },
      subject: { server: 'fixture', tool: 'echo' },
    });
    expect(classify('mcp__claude_ai_Docs__read').subject).toEqual({
      server: 'claude_ai_Docs',
      tool: 'read',
    });
    expect(classify('mcp__nothing').kind).toBe('other');
  });

  it('has a destination for every tool the recorded installation announces — S-45', () => {
    const directory = path.join(import.meta.dirname, '../../../../../fakes/agent-sdk/fixtures');
    const announced = new Set<string>();
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
      const recording = JSON.parse(readFileSync(path.join(directory, file), 'utf8')) as {
        messages?: { type?: string; subtype?: string; tools?: string[] }[];
      };
      for (const message of recording.messages ?? []) {
        if (message.type === 'system' && message.subtype === 'init') {
          for (const name of message.tools ?? []) {
            announced.add(name);
          }
        }
      }
    }

    const known = new Set<string>(CLAUDE_TOOLS);
    const withoutDestination = [...announced].filter(
      (name) => !name.startsWith('mcp__') && !known.has(name),
    );

    expect(announced.size).toBeGreaterThan(10);
    expect(withoutDestination).toEqual([]);
  });

  it('makes a path relative to the folder of the session, and leaves one outside it as it is', () => {
    expect(relativeTo('/srv/app', '/srv/app/src/a.ts')).toBe('src/a.ts');
    expect(relativeTo('/srv/app', '/srv/apple/a.ts')).toBe('/srv/apple/a.ts');
    expect(relativeTo('', '/srv/app/a.ts')).toBe('/srv/app/a.ts');
  });
});

describe('what a call asks of the person — plan 28, B-20 and B-21', () => {
  it('reads an ExitPlanMode into a plan: its markdown and the file it went to — S-61', () => {
    expect(
      classify('ExitPlanMode', { plan: '# Plan\n\n1. Do it', planFilePath: '/srv/app/plan.md' })
        .interaction,
    ).toEqual({ kind: 'plan', markdown: '# Plan\n\n1. Do it', path: '/srv/app/plan.md' });
  });

  it('reads a plan with no file, and one with no text, without inventing either — S-61', () => {
    expect(classify('ExitPlanMode', { plan: '# Plan' }).interaction).toEqual({
      kind: 'plan',
      markdown: '# Plan',
      path: null,
    });
    expect(classify('ExitPlanMode', { plan: 3, planFilePath: '' }).interaction).toEqual({
      kind: 'plan',
      markdown: '',
      path: null,
    });
  });

  it('reads an AskUserQuestion into the normalised question, ids by position — S-64', () => {
    const tool = classify('AskUserQuestion', {
      questions: [
        {
          question: 'Which?',
          header: 'Pick',
          options: [{ label: 'A' }, { label: 'B' }],
        },
      ],
    });

    expect(tool.kind).toBe('question');
    expect(tool.interaction).toMatchObject({
      kind: 'question',
      malformed: false,
      questions: [{ id: 'q1', prompt: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }],
    });
  });

  it('reads a question it cannot offer as malformed, still a question — S-64', () => {
    expect(classify('AskUserQuestion', { questions: 'nope' }).interaction).toEqual({
      kind: 'question',
      malformed: true,
      questions: [],
    });
  });

  it('gives no interaction to a call that asks nothing', () => {
    for (const name of ['Bash', 'Read', 'TodoWrite', 'EnterPlanMode', 'mcp__x__y', 'Brand']) {
      expect(classify(name, {}).interaction, name).toBeUndefined();
    }
  });
});

describe('what a call does to the task list — plan 28, B-22, S-66', () => {
  it('reads a TodoWrite as the whole list, in canonical statuses, its text as the id', () => {
    expect(
      classify('TodoWrite', {
        todos: [
          { content: 'Plan', status: 'completed', activeForm: 'Planning' },
          { content: 'Build', status: 'in_progress', activeForm: '' },
          { content: 'Ship', status: 'pending' },
        ],
      }).tasks,
    ).toEqual({
      op: 'replace',
      tasks: [
        { id: 'Plan', title: 'Plan', activeTitle: 'Planning', status: 'completed' },
        { id: 'Build', title: 'Build', activeTitle: null, status: 'inProgress' },
        { id: 'Ship', title: 'Ship', activeTitle: null, status: 'pending' },
      ],
    });
  });

  it('reads an empty TodoWrite as an empty list', () => {
    expect(classify('TodoWrite', { todos: [] }).tasks).toEqual({ op: 'replace', tasks: [] });
  });

  it.each([
    ['no list', {}],
    ['a list that is not one', { todos: 'all' }],
    ['an entry with no text', { todos: [{ status: 'pending' }] }],
    ['an entry with a status Claude Code has not', { todos: [{ content: 'a', status: 'done' }] }],
    ['an entry that is not an object', { todos: ['a'] }],
    ['an entry that is null', { todos: [{ content: 'a', status: 'pending' }, null] }],
  ])('reads a TodoWrite with %s as no step at all', (_case, input) => {
    expect(classify('TodoWrite', input).tasks).toBeUndefined();
  });

  it('reads a TaskCreate as one task more, with its running title when it has one', () => {
    expect(classify('TaskCreate', { subject: 'Write', activeForm: 'Writing' }).tasks).toEqual({
      op: 'create',
      title: 'Write',
      activeTitle: 'Writing',
    });
    expect(classify('TaskCreate', { subject: 'Write' }).tasks).toEqual({
      op: 'create',
      title: 'Write',
      activeTitle: null,
    });
    expect(classify('TaskCreate', {}).tasks).toBeUndefined();
  });

  it('reads a TaskUpdate as the change of one task, by its id, only what it says', () => {
    expect(
      classify('TaskUpdate', {
        taskId: '3',
        subject: 'Renamed',
        activeForm: 'Renaming',
        status: 'in_progress',
      }).tasks,
    ).toEqual({
      op: 'update',
      id: '3',
      title: 'Renamed',
      activeTitle: 'Renaming',
      status: 'inProgress',
    });
    expect(classify('TaskUpdate', { taskId: '3' }).tasks).toEqual({ op: 'update', id: '3' });
    expect(classify('TaskUpdate', { taskId: '3', status: 'completed' }).tasks).toEqual({
      op: 'update',
      id: '3',
      status: 'completed',
    });
  });

  it('reads a deletion as one, and an unknown status or no id as no step', () => {
    expect(classify('TaskUpdate', { taskId: '3', status: 'deleted' }).tasks).toEqual({
      op: 'update',
      id: '3',
      status: 'deleted',
    });
    expect(classify('TaskUpdate', { taskId: '3', status: 'blocked' }).tasks).toBeUndefined();
    expect(classify('TaskUpdate', { status: 'completed' }).tasks).toBeUndefined();
  });

  it('gives no step to a call that only reads the list', () => {
    expect(classify('TaskGet', { taskId: '1' }).tasks).toBeUndefined();
    expect(classify('TaskList').tasks).toBeUndefined();
  });
});
