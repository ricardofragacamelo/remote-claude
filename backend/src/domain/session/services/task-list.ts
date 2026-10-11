import type { TaskItem, TaskStep } from '@domain/engine';

/**
 * [tasks] with [step] applied — or `null` when the step does not apply: an update of a task the list
 * does not have, or a creation with no id to give it (plan 28, B-22).
 *
 * @param createdId the id the call's result gave a created task
 */
export function applyTaskStep(
  tasks: readonly TaskItem[],
  step: TaskStep,
  createdId: string | null,
): readonly TaskItem[] | null {
  switch (step.op) {
    case 'replace':
      return step.tasks;
    case 'create':
      return createdId === null
        ? null
        : [
            ...tasks,
            { id: createdId, title: step.title, activeTitle: step.activeTitle, status: 'pending' },
          ];
    default:
      return updated(tasks, step);
  }
}

/** [tasks] with the update applied to its task, `null` when the list has no such task. */
function updated(
  tasks: readonly TaskItem[],
  step: Extract<TaskStep, { op: 'update' }>,
): readonly TaskItem[] | null {
  if (!tasks.some((task) => task.id === step.id)) {
    return null;
  }

  return tasks.flatMap((task) => {
    if (task.id !== step.id) {
      return [task];
    }

    return step.status === 'deleted'
      ? []
      : [
          {
            ...task,
            title: step.title ?? task.title,
            activeTitle: step.activeTitle ?? task.activeTitle,
            status: step.status ?? task.status,
          },
        ];
  });
}

/**
 * The agent's task list of one conversation, followed call by call (plan 28, B-22).
 *
 * The step of a call is remembered when the call starts and applied when it ends — and only when it
 * succeeds: a refused or failed call changed nothing, and a created task's id is only in its result.
 * Only the main conversation's calls count: a subagent's list is its own. One tracker for the live
 * stream of a session, and one for each read of a conversation's history, so both reach the same
 * list by the same steps.
 */
export class TaskListTracker {
  private tasks: readonly TaskItem[] = [];
  private readonly pending = new Map<string, TaskStep>();

  /** A call of the main conversation that changes the list began. */
  started(toolUseId: string, step: TaskStep): void {
    this.pending.set(toolUseId, step);
  }

  /**
   * A call ended. The list as it is now, when the call changed it; `null` when it did not — not a
   * call of the list, refused, failed, or a step that does not apply.
   */
  completed(
    toolUseId: string,
    outcome: { readonly succeeded: boolean; readonly taskId: string | null },
  ): readonly TaskItem[] | null {
    const step = this.pending.get(toolUseId);
    this.pending.delete(toolUseId);

    const next =
      step === undefined || !outcome.succeeded
        ? null
        : applyTaskStep(this.tasks, step, outcome.taskId);

    if (next !== null) {
      this.tasks = next;
    }

    return next;
  }
}
