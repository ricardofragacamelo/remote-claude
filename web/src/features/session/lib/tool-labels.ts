import type { ToolExecution } from '../types/live-session';
import { changesTaskList } from './task-list';

/** A compact label of a tool: a translation key, and what it is filled with. */
export interface ToolLabel {
  /** One of `sessions.tool.*`. */
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;

  /**
   * The label the tool would have without its title — "Bash: pnpm test" under "Bash · Run the
   * tests" —, so the accessible name still says the command (plan 22, B-29). Absent when the label
   * is that one already.
   */
  readonly detail?: ToolLabel;
}

/** A string field of the input, or `''`. */
function field(input: Readonly<Record<string, unknown>>, name: string): string {
  const value = input[name];
  return typeof value === 'string' ? value : '';
}

/** A path, relative to the folder of the tab when it is inside it. */
export function relativeTo(folder: string, path: string): string {
  return path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path;
}

/** How many lines a text has — an empty one has none. */
function lines(text: string): number {
  return text === '' ? 0 : text.split('\n').length;
}

/** The first line of a command, which is what a row can show of it. */
function firstLine(text: string): string {
  const end = text.indexOf('\n');
  return end === -1 ? text : text.slice(0, end);
}

/** The host of a URL, or the URL itself when it is not one. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

type Labeller = (input: Readonly<Record<string, unknown>>, folder: string) => ToolLabel;

/** A subagent: what it was asked, and of which kind it is. */
const subagentLabel: Labeller = (input) => ({
  key: 'sessions.tool.agent',
  params: {
    description: field(input, 'description'),
    type: field(input, 'subagent_type') || 'general-purpose',
  },
});

/** The tools a row knows by name, and how each says what it is about. */
const LABELLERS: ReadonlyMap<string, Labeller> = new Map<string, Labeller>([
  [
    'Read',
    (input, folder) => ({
      key: 'sessions.tool.read',
      params: { path: relativeTo(folder, field(input, 'file_path')) },
    }),
  ],
  [
    'Edit',
    (input, folder) => ({
      key: 'sessions.tool.edit',
      params: {
        path: relativeTo(folder, field(input, 'file_path')),
        added: lines(field(input, 'new_string')),
        removed: lines(field(input, 'old_string')),
      },
    }),
  ],
  [
    'MultiEdit',
    (input, folder) => ({
      key: 'sessions.tool.multiEdit',
      params: { path: relativeTo(folder, field(input, 'file_path')) },
    }),
  ],
  [
    'Write',
    (input, folder) => ({
      key: 'sessions.tool.write',
      params: {
        path: relativeTo(folder, field(input, 'file_path')),
        lines: lines(field(input, 'content')),
      },
    }),
  ],
  [
    'NotebookEdit',
    (input, folder) => ({
      key: 'sessions.tool.notebookEdit',
      params: { path: relativeTo(folder, field(input, 'notebook_path')) },
    }),
  ],
  [
    'Bash',
    (input) => ({
      key: 'sessions.tool.bash',
      params: { command: firstLine(field(input, 'command')) },
    }),
  ],
  [
    'Grep',
    (input, folder) => ({
      key: field(input, 'path') === '' ? 'sessions.tool.grep' : 'sessions.tool.grepIn',
      params: { pattern: field(input, 'pattern'), path: relativeTo(folder, field(input, 'path')) },
    }),
  ],
  [
    'Glob',
    (input) => ({ key: 'sessions.tool.glob', params: { pattern: field(input, 'pattern') } }),
  ],
  [
    'WebFetch',
    (input) => ({ key: 'sessions.tool.webFetch', params: { host: hostOf(field(input, 'url')) } }),
  ],
  [
    'WebSearch',
    (input) => ({ key: 'sessions.tool.webSearch', params: { query: field(input, 'query') } }),
  ],
  ['Agent', subagentLabel],
  // The name the tool went by before the SDK called it `Agent` — the history still holds it.
  ['Task', subagentLabel],
  ['ExitPlanMode', () => ({ key: 'sessions.tool.exitPlan', params: {} })],
  // The task list (B-20): a row says what changed; the list itself is pinned above the conversation.
  [
    'TodoWrite',
    (input) => ({
      key: 'sessions.tool.todoWrite',
      params: { count: Array.isArray(input['todos']) ? input['todos'].length : 0 },
    }),
  ],
  [
    'TaskCreate',
    (input) => ({ key: 'sessions.tool.taskCreate', params: { subject: field(input, 'subject') } }),
  ],
  [
    'TaskUpdate',
    (input) => ({ key: 'sessions.tool.taskUpdate', params: { id: field(input, 'taskId') } }),
  ],
  [
    'TaskGet',
    (input) => ({ key: 'sessions.tool.taskGet', params: { id: field(input, 'taskId') } }),
  ],
  ['TaskList', () => ({ key: 'sessions.tool.taskList', params: {} })],
]);

/** `mcp__server__tool`: the server and the tool of an MCP tool, or `null` for any other name. */
function mcpOf(name: string): { readonly server: string; readonly tool: string } | null {
  const match = /^mcp__(.+?)__(.+)$/.exec(name);
  // Both groups match whenever the pattern does.
  return match === null ? null : { server: String(match[1]), tool: String(match[2]) };
}

/**
 * One line that says what a tool did, translated and relative to the folder (plan 08, B-17) —
 * "Read src/x.ts", "Edit src/x.ts (+3 −1)", "Bash: pnpm test". An MCP tool says its server and its
 * tool; one this build does not know says its name. The exact input is a click away, always.
 *
 * With the description the model gave the call (`title`, plan 22, D-05), the line is the tool and that
 * description — "Bash · Run the tests" —, as the Claude Code shows it. A subagent keeps its own line,
 * which says the description already, and its kind besides.
 *
 * @param absorbed the calls of the list tools the task list read — any other one says its name
 */
/**
 * The line of a question of Claude, from the questions the server normalised — "Asked: Library",
 * or "Asked 3 questions" (plan 24, B-15). Never from the SDK's input.
 */
export function questionLabel(questions: readonly { readonly header: string }[]): ToolLabel {
  const [only] = questions;

  return questions.length === 1 && only !== undefined && only.header !== ''
    ? { key: 'permission.question.asked', params: { header: only.header } }
    : { key: 'permission.question.askedMany', params: { count: questions.length } };
}

export function toolLabel(
  tool: Pick<ToolExecution, 'toolUseId' | 'toolName' | 'input' | 'title'>,
  folder: string,
  absorbed: ReadonlySet<string> = new Set(),
): ToolLabel {
  const plain = untitledLabel(tool, folder, absorbed);

  if (tool.title === undefined || opensSubagent(tool.toolName)) {
    return plain;
  }

  const mcp = mcpOf(tool.toolName);
  const name = mcp === null ? tool.toolName : `${mcp.server} · ${mcp.tool}`;

  return { key: 'sessions.tool.titled', params: { name, title: tool.title }, detail: plain };
}

/** The line of a tool by what it is and its input — the one it has with no title. */
function untitledLabel(
  tool: Pick<ToolExecution, 'toolUseId' | 'toolName' | 'input'>,
  folder: string,
  absorbed: ReadonlySet<string>,
): ToolLabel {
  const labeller = LABELLERS.get(tool.toolName);
  // A call of the list the list could not read — out of the format, of a task it does not have —
  // is the tool it is, by its name, with the whole input a click away (S-86).
  const unread = changesTaskList(tool.toolName) && !absorbed.has(tool.toolUseId);

  if (labeller !== undefined && !unread) {
    return labeller(tool.input, folder);
  }

  const mcp = mcpOf(tool.toolName);

  return mcp === null
    ? { key: 'sessions.tool.other', params: { name: tool.toolName } }
    : { key: 'sessions.tool.mcp', params: mcp };
}

/** Whether a tool opens a subagent, whose messages are nested under it (D-15). */
export function opensSubagent(toolName: string): boolean {
  return toolName === 'Agent' || toolName === 'Task';
}
