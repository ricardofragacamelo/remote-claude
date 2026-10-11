import { isRecord, readText } from '@/shared/lib/json';
import type { AgentTask, Conversation, TaskStatus } from '../types/live-session';

/** The three states the contract carries. */
const STATUSES = new Set<string>(['pending', 'inProgress', 'completed']);

/** One task of the event, or `null` when it is not one this build can draw whole. */
function taskOf(value: unknown): AgentTask | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value, 'id');
  const title = readText(value, 'title');
  const status = readText(value, 'status');

  return id === null || title === null || status === null || !STATUSES.has(status)
    ? null
    : { id, title, activeTitle: readText(value, 'activeTitle'), status: status as TaskStatus };
}

/**
 * A `session.tasksChanged`: the agent's whole list, as it is now (plan 28, B-22). It replaces the
 * list that was there, which is kept as the one before it, so a screen can say what the change
 * moved. The server reads it from the agent's own calls; nothing here rebuilds it from them.
 *
 * The same reader for the live stream and for the history, which carries the event right after the
 * call that changed the list — so a reload draws the list the stream drew (S-67). A task this build
 * cannot read is left out; a payload with no list at all changes nothing.
 */
export function applyTasksChanged(
  state: Conversation,
  payload: Readonly<Record<string, unknown>>,
): Conversation {
  const sent: unknown = payload['tasks'];

  if (!Array.isArray(sent)) {
    return state;
  }

  const tasks = sent.flatMap((value) => {
    const task = taskOf(value);
    return task === null ? [] : [task];
  });

  return { ...state, taskList: { tasks, previous: state.taskList?.tasks ?? [] } };
}
