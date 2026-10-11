import type {
  CanonicalTool,
  FileChange,
  FileEdit,
  ReadWindow,
  TaskItem,
  TaskStatus,
  TaskStep,
  ToolKind,
  ToolLabel,
  ToolSubject,
} from '@domain/engine';
import { CLAUDE_ENGINE } from './claude-engine';
import { normalizeQuestion } from './question-input';

type Input = Readonly<Record<string, unknown>>;

/** What a tool is, but where it came from: the adapter adds the origin. */
type Classified = Omit<CanonicalTool, 'origin'>;

/** How one tool of Claude Code becomes a canonical one, from its input and the session's folder. */
type Classify = (input: Input, folder: string) => Classified;

/** A string field of the input, or `''`. */
function field(input: Input, name: string): string {
  const value = input[name];
  return typeof value === 'string' ? value : '';
}

/** [path] relative to [folder], when it is inside it — what a label shows. */
export function relativeTo(folder: string, path: string): string {
  return folder !== '' && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path;
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

/** The host of a URL, or the URL itself when it is not one. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    // Not a URL: the label shows what the agent sent, as it sent it.
    return url;
  }
}

/** A label of [messageKey], with [params]. */
function label(messageKey: string, params: ToolLabel['params'] = {}): ToolLabel {
  return { messageKey, params };
}

/** [path] as the subject of a call, when there is one. */
function pathsOf(path: string): ToolSubject {
  return path === '' ? {} : { paths: [path] };
}

/**
 * What a call writes, only for an absolute path: a relative one would be resolved against the
 * backend's working directory, which is not the session's — better no change than one of the wrong
 * file (the rule of the undo, ADR-013).
 */
function changeAt(path: string, change: Omit<FileChange, 'path'>): readonly FileChange[] {
  return path.startsWith('/') ? [{ path, ...change }] : [];
}

/** The replacements of a `MultiEdit`, in order — the ones that are replacements. */
function editsOf(value: unknown): FileEdit[] {
  return (Array.isArray(value) ? value : []).flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const edit = entry as Input;
    return [
      {
        oldText: field(edit, 'old_string'),
        newText: field(edit, 'new_string'),
        ...(edit['replace_all'] === true ? { replaceAll: true } : {}),
      },
    ];
  });
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

const read: Classify = (input, folder) => {
  const path = field(input, 'file_path') || field(input, 'notebook_path');
  const window = windowOf(input);
  return tool(
    'file.read',
    'sessions.tool.fileRead',
    { path: relativeTo(folder, path) },
    { ...pathsOf(path), ...(window === null ? {} : { window }) },
  );
};

/** The part of the file a `Read` reads — the line to start at, how many, the pages of a PDF. */
function windowOf(input: Input): ReadWindow | null {
  const offset = input['offset'];
  const limit = input['limit'];
  const pages = input['pages'];
  const window: ReadWindow = {
    ...(typeof offset === 'number' ? { offset } : {}),
    ...(typeof limit === 'number' ? { limit } : {}),
    ...(typeof pages === 'string' ? { pages } : {}),
  };
  return Object.keys(window).length === 0 ? null : window;
}

const edit: Classify = (input, folder) => {
  const path = field(input, 'file_path');
  const one: FileEdit = {
    oldText: field(input, 'old_string'),
    newText: field(input, 'new_string'),
    ...(input['replace_all'] === true ? { replaceAll: true } : {}),
  };
  return tool(
    'file.edit',
    'sessions.tool.fileEdit',
    { path: relativeTo(folder, path), added: lines(one.newText), removed: lines(one.oldText) },
    pathsOf(path),
    changeAt(path, { op: 'edit', edits: [one] }),
  );
};

const multiEdit: Classify = (input, folder) => {
  const path = field(input, 'file_path');
  return tool(
    'file.edit',
    'sessions.tool.fileEditMany',
    { path: relativeTo(folder, path) },
    pathsOf(path),
    changeAt(path, { op: 'edit', edits: editsOf(input['edits']) }),
  );
};

const notebookEdit: Classify = (input, folder) => {
  const path = field(input, 'notebook_path');
  // A cell of a notebook is replaced by its id, not by text: the undo snapshots the file, and no
  // diff is computed from it.
  return tool(
    'file.edit',
    'sessions.tool.fileEditCell',
    { path: relativeTo(folder, path) },
    pathsOf(path),
    changeAt(path, { op: 'edit' }),
  );
};

const write: Classify = (input, folder) => {
  const path = field(input, 'file_path');
  const content = field(input, 'content');
  return tool(
    'file.write',
    'sessions.tool.fileWrite',
    { path: relativeTo(folder, path), lines: lines(content) },
    pathsOf(path),
    changeAt(path, { op: 'write', content }),
  );
};

const shell: Classify = (input) => {
  const command = field(input, 'command');
  return tool('shell', 'sessions.tool.shell', { command: firstLine(command) }, { command });
};

const shellOutput: Classify = () => tool('shell.output', 'sessions.tool.shellOutput', {});

const grep: Classify = (input, folder) => {
  const pattern = field(input, 'pattern');
  const path = field(input, 'path');
  return path === ''
    ? tool('search', 'sessions.tool.search', { pattern }, { pattern })
    : tool(
        'search',
        'sessions.tool.searchIn',
        { pattern, path: relativeTo(folder, path) },
        { pattern, paths: [path] },
      );
};

const glob: Classify = (input) => {
  const pattern = field(input, 'pattern');
  return tool('search', 'sessions.tool.searchFiles', { pattern }, { pattern });
};

const webFetch: Classify = (input) => {
  const url = field(input, 'url');
  return tool('web.fetch', 'sessions.tool.webFetch', { host: hostOf(url) }, { url });
};

const webSearch: Classify = (input) => {
  const query = field(input, 'query');
  return tool('web.search', 'sessions.tool.webSearch', { query }, { query });
};

const agent: Classify = (input) => {
  const description = field(input, 'description');
  return tool(
    'agent',
    'sessions.tool.agent',
    { description, type: field(input, 'subagent_type') || 'general-purpose' },
    description === '' ? {} : { description },
  );
};

const question: Classify = (input) => {
  const questions = Array.isArray(input['questions']) ? (input['questions'] as unknown[]) : [];
  const [only] = questions;
  const header = typeof only === 'object' && only !== null ? field(only as Input, 'header') : '';
  const interaction = normalizeQuestion(input);
  return questions.length === 1 && header !== ''
    ? { ...tool('question', 'sessions.tool.question', { header }), interaction }
    : { ...tool('question', 'sessions.tool.questions', { count: questions.length }), interaction };
};

const plan: Classify = (input) => {
  const path = field(input, 'planFilePath');
  return {
    ...tool('plan', 'sessions.tool.plan', {}),
    interaction: { kind: 'plan', markdown: field(input, 'plan'), path: path === '' ? null : path },
  };
};

/** How Claude Code names where a task stands. */
const TASK_STATUSES: Readonly<Record<string, TaskStatus>> = {
  pending: 'pending',
  in_progress: 'inProgress',
  completed: 'completed',
};

/** A status of a task, or `undefined` when it is not one. */
function statusOf(value: unknown): TaskStatus | undefined {
  return typeof value === 'string' ? TASK_STATUSES[value] : undefined;
}

/** One entry of a `TodoWrite`, or `null` when it cannot be read — then the whole list is not. */
function todoOf(entry: unknown): TaskItem | null {
  const todo = typeof entry === 'object' && entry !== null ? (entry as Input) : {};
  const title = field(todo, 'content');
  const status = statusOf(todo['status']);
  const active = field(todo, 'activeForm');
  return title === '' || status === undefined
    ? null
    : { id: title, title, activeTitle: active === '' ? null : active, status };
}

/** The whole list a `TodoWrite` writes, or nothing when any entry cannot be read. */
function replaceStep(todos: readonly unknown[]): { readonly tasks?: TaskStep } {
  const tasks = todos.map(todoOf);
  return tasks.some((task) => task === null)
    ? {}
    : { tasks: { op: 'replace', tasks: tasks.filter((task) => task !== null) } };
}

const tasksWrite: Classify = (input) => {
  const todos = Array.isArray(input['todos']) ? (input['todos'] as unknown[]) : null;
  return {
    ...tool('tasks', 'sessions.tool.tasksWrite', { count: todos?.length ?? 0 }),
    ...(todos === null ? {} : replaceStep(todos)),
  };
};

const taskCreate: Classify = (input) => {
  const title = field(input, 'subject');
  const active = field(input, 'activeForm');
  return {
    ...tool('tasks', 'sessions.tool.taskCreate', { subject: title }),
    ...(title === ''
      ? {}
      : { tasks: { op: 'create', title, activeTitle: active === '' ? null : active } }),
  };
};

/** What a `TaskUpdate` changes of its task — nothing when its status is not one Claude Code has. */
function updateStep(input: Input, id: string): { readonly tasks?: TaskStep } {
  const raw = input['status'];
  const status = raw === 'deleted' ? 'deleted' : statusOf(raw);
  const title = field(input, 'subject');
  const active = field(input, 'activeForm');
  return id === '' || (raw !== undefined && status === undefined)
    ? {}
    : {
        tasks: {
          op: 'update',
          id,
          ...(title === '' ? {} : { title }),
          ...(active === '' ? {} : { activeTitle: active }),
          ...(status === undefined ? {} : { status }),
        },
      };
}

const taskUpdate: Classify = (input) => {
  const id = field(input, 'taskId');
  return { ...tool('tasks', 'sessions.tool.taskUpdate', { id }), ...updateStep(input, id) };
};

const taskGet: Classify = (input) =>
  tool('tasks', 'sessions.tool.taskGet', { id: field(input, 'taskId') });

const taskList: Classify = () => tool('tasks', 'sessions.tool.taskList', {});

/** A tool the core has no kind for: the generic line, with the engine's own name as its text. */
function other(name: string): Classified {
  return tool('other', 'sessions.tool.other', { name });
}

/** The classification of a tool that is `other` by name. */
function named(name: string): Classify {
  return () => other(name);
}

/**
 * Every tool of Claude Code the product knows, and its canonical kind (plan 28, B-14).
 *
 * A `Record` over the union, so a name added to {@link CLAUDE_TOOLS} without a classification does
 * not compile — the compiler's guarantee the `switch` with `never` of plan 27 · B-08 gives, without
 * a branch per tool. A name the table does not have is `other`, and always asks (R-01).
 */
export const CLAUDE_TOOLS = [
  'Read',
  'NotebookRead',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Bash',
  // The name the shell tool has in some releases' rules and hooks — graded by its command, as `Bash`.
  'BashTool',
  'BashOutput',
  'KillShell',
  'Glob',
  'Grep',
  'LS',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'Task',
  'Agent',
  'AskUserQuestion',
  'ExitPlanMode',
  'EnterPlanMode',
  'Skill',
  'SlashCommand',
  'Artifact',
  'ArtifactComments',
  'ArtifactData',
  'CronCreate',
  'CronDelete',
  'CronList',
  'DesignSync',
  'EnterWorktree',
  'ExitWorktree',
  'ListAgents',
  'Monitor',
  'PushNotification',
  'RemoteTrigger',
  'ReportFindings',
  'ScheduleWakeup',
  'SendMessage',
  'ShareOnboardingGuide',
  'ToolSearch',
  'Workflow',
] as const;

type ClaudeTool = (typeof CLAUDE_TOOLS)[number];

const CLASSIFY: Readonly<Record<ClaudeTool, Classify>> = {
  Read: read,
  NotebookRead: read,
  Write: write,
  Edit: edit,
  MultiEdit: multiEdit,
  NotebookEdit: notebookEdit,
  Bash: shell,
  BashTool: shell,
  BashOutput: shellOutput,
  KillShell: named('KillShell'),
  Glob: glob,
  Grep: grep,
  LS: named('LS'),
  WebFetch: webFetch,
  WebSearch: webSearch,
  TodoWrite: tasksWrite,
  TaskCreate: taskCreate,
  TaskUpdate: taskUpdate,
  TaskGet: taskGet,
  TaskList: taskList,
  TaskOutput: named('TaskOutput'),
  TaskStop: named('TaskStop'),
  // The name the subagent tool went by before the SDK called it `Agent` — the history holds it.
  Task: agent,
  Agent: agent,
  AskUserQuestion: question,
  ExitPlanMode: plan,
  EnterPlanMode: named('EnterPlanMode'),
  Skill: named('Skill'),
  SlashCommand: named('SlashCommand'),
  // What the installation announces beyond the tools the product draws: each one a generic line,
  // which asks, as every tool outside the read and write tables always did.
  Artifact: named('Artifact'),
  ArtifactComments: named('ArtifactComments'),
  ArtifactData: named('ArtifactData'),
  CronCreate: named('CronCreate'),
  CronDelete: named('CronDelete'),
  CronList: named('CronList'),
  DesignSync: named('DesignSync'),
  EnterWorktree: named('EnterWorktree'),
  ExitWorktree: named('ExitWorktree'),
  ListAgents: named('ListAgents'),
  Monitor: named('Monitor'),
  PushNotification: named('PushNotification'),
  RemoteTrigger: named('RemoteTrigger'),
  ReportFindings: named('ReportFindings'),
  ScheduleWakeup: named('ScheduleWakeup'),
  SendMessage: named('SendMessage'),
  ShareOnboardingGuide: named('ShareOnboardingGuide'),
  ToolSearch: named('ToolSearch'),
  Workflow: named('Workflow'),
};

/** `mcp__server__tool`, how Claude Code names a tool of an MCP server. */
const MCP = /^mcp__(.+?)__(.+)$/;

/** Whether [name] is one of the tools the table classifies. */
function isClaudeTool(name: string): name is ClaudeTool {
  return Object.hasOwn(CLASSIFY, name);
}

/**
 * [name] and [input] of a call of Claude Code, as the core reads it: its kind, label, subject and
 * changes, and its origin. Exhaustive over {@link CLAUDE_TOOLS}; an MCP tool is `mcp`; anything else
 * is `other`, which no rule allows broadly and which always asks (R-01).
 *
 * @param folder the folder of the session — what the label's paths are relative to
 */
export function classifyTool(name: string, input: Input, folder: string): CanonicalTool {
  const origin = { engine: CLAUDE_ENGINE, native: name };
  const mcp = MCP.exec(name);

  if (mcp !== null) {
    const server = String(mcp[1]);
    const call = String(mcp[2]);
    return {
      ...tool('mcp', 'sessions.tool.mcp', { server, tool: call }, { server, tool: call }),
      origin,
    };
  }

  return { ...(isClaudeTool(name) ? CLASSIFY[name](input, folder) : other(name)), origin };
}
