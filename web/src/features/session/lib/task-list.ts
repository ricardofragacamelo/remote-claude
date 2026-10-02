import { isRecord } from '@/shared/lib/json';
import type { ToolExecution } from '../types/live-session';

/** Where a task of the list is. */
export type TaskState = 'pending' | 'inProgress' | 'completed';

/** One task of the list, as the panel draws it. */
export interface TaskItem {
  /** What the list is keyed by on screen — the task's id, or the call that made it. */
  readonly key: string;

  /** The id of a `Task*` task — `null` for a `TodoWrite` item, and for a creation not ended yet. */
  readonly id: string | null;
  readonly title: string;

  /** What is said of it while it is in progress — "Writing a.txt". */
  readonly activeForm: string;
  readonly state: TaskState;

  /** Where it was before the last change of the list — `null` when that change left it as it was. */
  readonly was: TaskState | null;
}

/** The list as the tools left it, and the calls it was made of. */
export interface TaskList {
  readonly items: readonly TaskItem[];

  /**
   * The calls the list read. Any other call of a list tool — out of the format, of a task the list
   * does not have, or one that failed — is drawn as the tool it is (S-86).
   */
  readonly absorbed: ReadonlySet<string>;
}

/** The tools that change the list. `TaskGet` and `TaskList` only read it. */
const LIST_TOOLS: ReadonlySet<string> = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate']);

/** Whether a tool is one that changes the list — drawn as a change of it when the list read it. */
export function changesTaskList(toolName: string): boolean {
  return LIST_TOOLS.has(toolName);
}

/** The states as the CLI writes them. */
const STATES: ReadonlyMap<unknown, TaskState> = new Map<unknown, TaskState>([
  ['pending', 'pending'],
  ['in_progress', 'inProgress'],
  ['completed', 'completed'],
]);

/** A text of the input, or `null` when it is absent or of another type. */
function text(input: Readonly<Record<string, unknown>>, name: string): string | null {
  const value = input[name];
  return typeof value === 'string' ? value : null;
}

/** The list after one call, or `null` when the call is not one the list can read. */
type Step = (items: readonly TaskItem[], tool: ToolExecution) => TaskItem[] | null;

/** Each item, with where it was if that changed — compared by key with the list before. */
function withTransitions(before: readonly TaskItem[], after: readonly TaskItem[]): TaskItem[] {
  const previous = new Map(before.map((item) => [item.key, item.state]));

  return after.map((item) => {
    const was = previous.get(item.key);
    return { ...item, was: was === undefined || was === item.state ? null : was };
  });
}

/** One item of a `TodoWrite`, or `null` when it is out of the format. */
function todoOf(todo: unknown): TaskItem | null {
  const content = isRecord(todo) ? text(todo, 'content') : null;
  const state = isRecord(todo) ? STATES.get(todo['status']) : undefined;

  if (!isRecord(todo) || content === null || state === undefined) {
    return null;
  }

  return {
    key: `todo:${content}`,
    id: null,
    title: content,
    activeForm: text(todo, 'activeForm') ?? content,
    state,
    was: null,
  };
}

/** A `TodoWrite`: the whole list, every time — an empty one clears it. */
const todoWrite: Step = (items, tool) => {
  const todos = tool.input['todos'];

  if (!Array.isArray(todos)) {
    return null;
  }

  const next = todos.map(todoOf);
  return next.some((item) => item === null)
    ? null
    : withTransitions(
        items,
        next.filter((item) => item !== null),
      );
};

/** A `TaskCreate`: one task more, pending — its id is known once the call ended. */
const taskCreate: Step = (items, tool) => {
  const subject = text(tool.input, 'subject');

  if (subject === null) {
    return null;
  }

  const created: TaskItem = {
    key: tool.taskId ?? tool.toolUseId,
    id: tool.taskId,
    title: subject,
    activeForm: text(tool.input, 'activeForm') ?? subject,
    state: 'pending',
    was: null,
  };

  return [...items.map((item) => ({ ...item, was: null })), created];
};

/** The item a `TaskUpdate` leaves, or `undefined` for one that takes it out of the list. */
function updated(item: TaskItem, input: Readonly<Record<string, unknown>>): TaskItem | undefined {
  const status = input['status'];
  const state = status === undefined ? item.state : STATES.get(status);

  return state === undefined
    ? undefined
    : {
        ...item,
        title: text(input, 'subject') ?? item.title,
        activeForm: text(input, 'activeForm') ?? item.activeForm,
        state,
      };
}

/** A `TaskUpdate`: one task changed, or taken out with `deleted` — by its id, never its place. */
const taskUpdate: Step = (items, tool) => {
  const taskId = text(tool.input, 'taskId');
  const status = tool.input['status'];
  const known = items.some((item) => item.id !== null && item.id === taskId);

  if (
    taskId === null ||
    !known ||
    (status !== undefined && status !== 'deleted' && !STATES.has(status))
  ) {
    return null;
  }

  const next = items.flatMap((item) => {
    if (item.id !== taskId) return [item];
    const changed = updated(item, tool.input);
    return changed === undefined ? [] : [changed];
  });

  return withTransitions(items, next);
};

const STEPS: ReadonlyMap<string, Step> = new Map([
  ['TodoWrite', todoWrite],
  ['TaskCreate', taskCreate],
  ['TaskUpdate', taskUpdate],
]);

/**
 * The task list of a conversation, from the calls of its tools in order (plan 08, B-20, D-25): the
 * whole list of each `TodoWrite`, or the `TaskCreate`/`TaskUpdate` one at a time — by the **name of
 * the tool**, never by the model, and both may appear in one conversation. The same calls come from
 * the stream and from the history, so a reload draws the same list (S-87).
 *
 * Only the main conversation: a subagent's list is its own. A call that failed or was refused
 * changed nothing.
 */
export function taskListOf(tools: readonly ToolExecution[]): TaskList {
  let items: readonly TaskItem[] = [];
  const absorbed = new Set<string>();

  for (const tool of tools) {
    const step = STEPS.get(tool.toolName);
    const counts =
      tool.parentToolUseId === null && tool.status !== 'failed' && tool.status !== 'denied';
    const next = step === undefined || !counts ? null : step(items, tool);

    if (next !== null) {
      items = next;
      absorbed.add(tool.toolUseId);
    }
  }

  return { items, absorbed };
}
