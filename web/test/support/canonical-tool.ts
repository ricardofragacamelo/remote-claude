import type { ToolCall } from '@/shared/lib/tool-call';

/**
 * A tool call of the coding agent the product drives today, as the backend's classifier hands it to
 * a client (plan 28, B-14): the canonical kind, the label it built, the subject, the changes, the
 * origin and the exact input. One place for the specs, so the payloads they feed the reducer and the
 * cards read as the backend sends them — and a spec still says which tool it means by its name.
 *
 * It mirrors `backend/src/adapter/outbound/engines/claude/tool-classifier.ts` for the tools the specs
 * use; any other name is `other`, labelled by its name, as there.
 */

type Input = Readonly<Record<string, unknown>>;
type Canonical = Omit<ToolCall, 'origin' | 'rawInput'>;

const text = (input: Input, name: string): string => {
  const value = input[name];
  return typeof value === 'string' ? value : '';
};

const relative = (folder: string, path: string): string =>
  folder !== '' && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path;

const lines = (value: string): number => (value === '' ? 0 : value.split('\n').length);

const firstLine = (value: string): string => value.split('\n')[0] ?? '';

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const paths = (path: string) => (path === '' ? {} : { paths: [path] });

const changeAt = (path: string, op: 'edit' | 'write') =>
  path.startsWith('/') ? [{ path, op }] : [];

const canonical = (
  kind: string,
  messageKey: string,
  params: Readonly<Record<string, string | number>>,
  subject: ToolCall['subject'] = {},
  changes: ToolCall['changes'] = [],
): Canonical => ({ kind, label: { messageKey, params }, subject, changes });

type Classify = (input: Input, folder: string) => Canonical;

const read: Classify = (input, folder) => {
  const path = text(input, 'file_path') || text(input, 'notebook_path');
  return canonical(
    'file.read',
    'sessions.tool.fileRead',
    { path: relative(folder, path) },
    paths(path),
  );
};

const agent: Classify = (input) =>
  canonical(
    'agent',
    'sessions.tool.agent',
    {
      description: text(input, 'description'),
      type: text(input, 'subagent_type') || 'general-purpose',
    },
    text(input, 'description') === '' ? {} : { description: text(input, 'description') },
  );

const CLASSIFY: Readonly<Record<string, Classify>> = {
  Read: read,
  Edit: (input, folder) => {
    const path = text(input, 'file_path');
    return canonical(
      'file.edit',
      'sessions.tool.fileEdit',
      {
        path: relative(folder, path),
        added: lines(text(input, 'new_string')),
        removed: lines(text(input, 'old_string')),
      },
      paths(path),
      changeAt(path, 'edit'),
    );
  },
  MultiEdit: (input, folder) => {
    const path = text(input, 'file_path');
    return canonical(
      'file.edit',
      'sessions.tool.fileEditMany',
      { path: relative(folder, path) },
      paths(path),
      changeAt(path, 'edit'),
    );
  },
  NotebookEdit: (input, folder) => {
    const path = text(input, 'notebook_path');
    return canonical(
      'file.edit',
      'sessions.tool.fileEditCell',
      { path: relative(folder, path) },
      paths(path),
      changeAt(path, 'edit'),
    );
  },
  Write: (input, folder) => {
    const path = text(input, 'file_path');
    return canonical(
      'file.write',
      'sessions.tool.fileWrite',
      { path: relative(folder, path), lines: lines(text(input, 'content')) },
      paths(path),
      changeAt(path, 'write'),
    );
  },
  Bash: (input) =>
    canonical(
      'shell',
      'sessions.tool.shell',
      { command: firstLine(text(input, 'command')) },
      { command: text(input, 'command') },
    ),
  BashOutput: () => canonical('shell.output', 'sessions.tool.shellOutput', {}),
  Grep: (input, folder) => {
    const pattern = text(input, 'pattern');
    const path = text(input, 'path');
    return path === ''
      ? canonical('search', 'sessions.tool.search', { pattern }, { pattern })
      : canonical(
          'search',
          'sessions.tool.searchIn',
          { pattern, path: relative(folder, path) },
          { pattern, paths: [path] },
        );
  },
  Glob: (input) =>
    canonical(
      'search',
      'sessions.tool.searchFiles',
      { pattern: text(input, 'pattern') },
      { pattern: text(input, 'pattern') },
    ),
  WebFetch: (input) =>
    canonical(
      'web.fetch',
      'sessions.tool.webFetch',
      { host: hostOf(text(input, 'url')) },
      { url: text(input, 'url') },
    ),
  WebSearch: (input) =>
    canonical(
      'web.search',
      'sessions.tool.webSearch',
      { query: text(input, 'query') },
      { query: text(input, 'query') },
    ),
  Agent: agent,
  Task: agent,
  AskUserQuestion: (input) => {
    const questions = Array.isArray(input['questions']) ? (input['questions'] as unknown[]) : [];
    const [only] = questions;
    const header = typeof only === 'object' && only !== null ? text(only as Input, 'header') : '';
    return questions.length === 1 && header !== ''
      ? canonical('question', 'sessions.tool.question', { header })
      : canonical('question', 'sessions.tool.questions', { count: questions.length });
  },
  ExitPlanMode: () => canonical('plan', 'sessions.tool.plan', {}),
  TodoWrite: (input) =>
    canonical('tasks', 'sessions.tool.tasksWrite', {
      count: Array.isArray(input['todos']) ? input['todos'].length : 0,
    }),
  TaskCreate: (input) =>
    canonical('tasks', 'sessions.tool.taskCreate', { subject: text(input, 'subject') }),
  TaskUpdate: (input) =>
    canonical('tasks', 'sessions.tool.taskUpdate', { id: text(input, 'taskId') }),
  TaskGet: (input) => canonical('tasks', 'sessions.tool.taskGet', { id: text(input, 'taskId') }),
  TaskList: () => canonical('tasks', 'sessions.tool.taskList', {}),
};

const MCP = /^mcp__(.+?)__(.+)$/;

/**
 * The canonical fields of a call of [name] with [input], its paths relative to [folder] — what a
 * `tool.started` and a `permission.requested` carry about the tool.
 */
export function aToolCall(name: string, input: Input = {}, folder = ''): ToolCall {
  const origin = { engine: 'claude', native: name };
  const mcp = MCP.exec(name);

  if (mcp !== null) {
    const server = String(mcp[1]);
    const tool = String(mcp[2]);
    return {
      ...canonical('mcp', 'sessions.tool.mcp', { server, tool }, { server, tool }),
      origin,
      rawInput: input,
    };
  }

  const classify = CLASSIFY[name];

  return {
    ...(classify === undefined
      ? canonical('other', 'sessions.tool.other', { name })
      : classify(input, folder)),
    origin,
    rawInput: input,
  };
}
