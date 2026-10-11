/** Where a task of the agent's list stands. */
export type TaskStatus = 'pending' | 'inProgress' | 'completed';

/** One task of the agent's list, as a screen draws it (plan 28, B-22). */
export interface TaskItem {
  /** Opaque, stable for the life of the task: the engine's id, or the text of a task that has none. */
  readonly id: string;
  readonly title: string;
  /** What the task is called while it runs ("Running the tests"); `null` when the agent gave none. */
  readonly activeTitle: string | null;
  readonly status: TaskStatus;
}

/**
 * What one call does to the agent's task list, read by the engine's adapter (plan 28, B-22):
 *
 * - `replace` — the whole list, as a call that writes the list at once gives it;
 * - `create` — one task more, whose id the call's result says (`taskId` of the completion);
 * - `update` — one task changed, or `deleted`, by its id.
 *
 * Applied when the call **succeeds**, never before: a refused or failed call left the list as it was.
 */
export type TaskStep =
  | { readonly op: 'replace'; readonly tasks: readonly TaskItem[] }
  | { readonly op: 'create'; readonly title: string; readonly activeTitle: string | null }
  | {
      readonly op: 'update';
      readonly id: string;
      readonly title?: string;
      readonly activeTitle?: string;
      readonly status?: TaskStatus | 'deleted';
    };
