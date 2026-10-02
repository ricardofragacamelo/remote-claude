import { describe, expect, it } from 'vitest';

import { opensSubagent, relativeTo, toolLabel } from '@/features/session/lib/tool-labels';

const FOLDER = '/home/dev/project';

function label(toolName: string, input: Record<string, unknown>) {
  return toolLabel({ toolUseId: 't-1', toolName, input }, FOLDER, new Set(['t-1']));
}

describe('the one line that says what a tool did — plan 08 B-17', () => {
  it.each([
    ['Read', { file_path: `${FOLDER}/src/a.ts` }, 'sessions.tool.read', { path: 'src/a.ts' }],
    [
      'Edit',
      { file_path: `${FOLDER}/src/a.ts`, old_string: 'a', new_string: 'b\nc\nd' },
      'sessions.tool.edit',
      { path: 'src/a.ts', added: 3, removed: 1 },
    ],
    [
      'Write',
      { file_path: '/elsewhere/out.txt', content: '' },
      'sessions.tool.write',
      { path: '/elsewhere/out.txt', lines: 0 },
    ],
    ['MultiEdit', { file_path: `${FOLDER}/m.ts` }, 'sessions.tool.multiEdit', { path: 'm.ts' }],
    [
      'NotebookEdit',
      { notebook_path: `${FOLDER}/n.ipynb` },
      'sessions.tool.notebookEdit',
      { path: 'n.ipynb' },
    ],
    ['Bash', { command: 'pnpm test\n  --watch' }, 'sessions.tool.bash', { command: 'pnpm test' }],
    ['Grep', { pattern: 'TODO' }, 'sessions.tool.grep', { pattern: 'TODO', path: '' }],
    [
      'Grep',
      { pattern: 'TODO', path: `${FOLDER}/src` },
      'sessions.tool.grepIn',
      { pattern: 'TODO', path: 'src' },
    ],
    ['Glob', { pattern: '**/*.ts' }, 'sessions.tool.glob', { pattern: '**/*.ts' }],
    [
      'WebFetch',
      { url: 'https://docs.example.com/a?b=1' },
      'sessions.tool.webFetch',
      { host: 'docs.example.com' },
    ],
    ['WebFetch', { url: 'not a url' }, 'sessions.tool.webFetch', { host: 'not a url' }],
    ['WebSearch', { query: 'vitest' }, 'sessions.tool.webSearch', { query: 'vitest' }],
    [
      'Agent',
      { description: 'look around', subagent_type: 'Explore' },
      'sessions.tool.agent',
      { description: 'look around', type: 'Explore' },
    ],
    [
      'Task',
      { description: 'old name' },
      'sessions.tool.agent',
      { description: 'old name', type: 'general-purpose' },
    ],
    ['ExitPlanMode', { plan: '# plan' }, 'sessions.tool.exitPlan', {}],
    ['TodoWrite', { todos: [{}, {}] }, 'sessions.tool.todoWrite', { count: 2 }],
    ['TodoWrite', { todos: 'x' }, 'sessions.tool.todoWrite', { count: 0 }],
    ['TaskCreate', { subject: 'Ship it' }, 'sessions.tool.taskCreate', { subject: 'Ship it' }],
    ['TaskUpdate', { taskId: '3' }, 'sessions.tool.taskUpdate', { id: '3' }],
    ['TaskGet', { taskId: '3' }, 'sessions.tool.taskGet', { id: '3' }],
    ['TaskList', {}, 'sessions.tool.taskList', {}],
  ])('labels %s by what it is about, relative to the folder — S-72', (tool, input, key, params) => {
    expect(label(tool, input)).toEqual({ key, params });
  });

  it('reads a field of the wrong type as empty, never as a crash', () => {
    expect(label('Read', { file_path: 42 })).toEqual({
      key: 'sessions.tool.read',
      params: { path: '' },
    });
  });

  it('says the server and the tool of an MCP tool — S-73', () => {
    expect(label('mcp__github__create_issue', {})).toEqual({
      key: 'sessions.tool.mcp',
      params: { server: 'github', tool: 'create_issue' },
    });
  });

  it('says only the name of a call of the list the list could not read — S-86', () => {
    expect(toolLabel({ toolUseId: 'other', toolName: 'TaskUpdate', input: {} }, FOLDER)).toEqual({
      key: 'sessions.tool.other',
      params: { name: 'TaskUpdate' },
    });
    expect(toolLabel({ toolUseId: 'other', toolName: 'TaskList', input: {} }, FOLDER).key).toBe(
      'sessions.tool.taskList',
    );
  });

  it('says the name of a tool this build does not know — S-73', () => {
    expect(label('Frobnicate', { a: 1 })).toEqual({
      key: 'sessions.tool.other',
      params: { name: 'Frobnicate' },
    });
  });

  it('keeps a path outside the folder whole', () => {
    expect(relativeTo(FOLDER, '/home/dev/project-b/a.ts')).toBe('/home/dev/project-b/a.ts');
    expect(relativeTo(FOLDER, `${FOLDER}/a.ts`)).toBe('a.ts');
  });

  it('knows which tools open a subagent — D-15', () => {
    expect(opensSubagent('Agent')).toBe(true);
    expect(opensSubagent('Task')).toBe(true);
    expect(opensSubagent('Bash')).toBe(false);
  });
});
