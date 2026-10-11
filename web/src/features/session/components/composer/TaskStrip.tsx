import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  ListChecks,
  LoaderCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import type { AgentTask, TaskList, TaskStatus } from '../../types/live-session';

/** One task as the strip draws it: where it is, and where it was before the last change moved it. */
interface TaskRowView {
  readonly task: AgentTask;

  /** Where it was before the last change of the list — `null` when that change left it as it was. */
  readonly was: TaskStatus | null;
}

/** The icon of each state — beside its word, never instead of it. */
const STATE_ICON: Readonly<Record<TaskStatus, LucideIcon>> = {
  pending: Circle,
  inProgress: LoaderCircle,
  completed: CircleCheck,
};

/** The words a task says while it is in progress — "Running the tests" —, or what it is. */
function wordsOf(task: AgentTask): string {
  return task.status === 'inProgress' ? (task.activeTitle ?? task.title) : task.title;
}

/** Each task of the list, with where it was — compared by id with the list before it. */
function rowsOf(list: TaskList): TaskRowView[] {
  const before = new Map(list.previous.map((task) => [task.id, task.status]));

  return list.tasks.map((task) => {
    const was = before.get(task.id);
    return { task, was: was === undefined || was === task.status ? null : was };
  });
}

/** One task: its state by icon and by word, what it is — or doing — and what it was a moment ago. */
function TaskRow({ row }: { readonly row: TaskRowView }): React.JSX.Element {
  const { t } = useTranslation();
  const { task, was } = row;
  const Icon = STATE_ICON[task.status];
  const state = t(`sessions.taskStatus.${task.status}`);

  return (
    <li
      className={cn(
        'flex items-start gap-1.5 text-ui-sm',
        task.status === 'completed' && 'text-muted-foreground line-through',
        was !== null && 'font-ui-strong',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{t('sessions.tasks.state', { state })}</span>
      <span className="min-w-0 flex-1">{wordsOf(task)}</span>
      {was !== null && (
        <span className="shrink-0 text-ui-xs text-muted-foreground no-underline">
          {t('sessions.tasks.was', { state: t(`sessions.taskStatus.${was}`) })}
        </span>
      )}
    </li>
  );
}

/** The line the list folds into: where it is, and what is being done — or what is next. */
function headlineOf(tasks: readonly AgentTask[], t: TFunction): string {
  const done = tasks.filter((task) => task.status === 'completed').length;
  const doing = tasks.find((task) => task.status === 'inProgress');
  const next = tasks.find((task) => task.status === 'pending');

  if (done === tasks.length) {
    return t('sessions.tasks.allDone', { done, total: tasks.length });
  }

  return t('sessions.tasks.headline', {
    done,
    total: tasks.length,
    task: doing === undefined ? (next?.title ?? '') : wordsOf(doing),
  });
}

/**
 * The task list the agent keeps, above the box (plan 08, B-20; plan 09, B-26, D-14): folded into one
 * line — "3/7 · Running the tests" — that unfolds into the whole list, pending, in progress and
 * completed, with which tasks the last change moved and from where (S-87). The list is the last
 * `session.tasksChanged`, whole — never rebuilt here from the agent's calls (plan 28, B-22) —, and
 * what moved is found by comparing it with the one before, by id.
 *
 * Nothing when there is no list, when the agent emptied it (S-86), or when its engine keeps none —
 * the caller passes `null` then (S-68). It lives outside the conversation, so a list that changes
 * never moves what is being read (S-74).
 */
export function TaskStrip({ list }: { readonly list: TaskList | null }): React.JSX.Element | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (list === null || list.tasks.length === 0) {
    return null;
  }

  const Chevron = open ? ChevronDown : ChevronUp;

  return (
    <section aria-label={t('sessions.tasks.label')} className="flex min-w-0 flex-col gap-1">
      {open && (
        <ul className="flex max-h-[30cqh] flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-2">
          {rowsOf(list).map((row) => (
            <TaskRow key={row.task.id} row={row} />
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-ui-xs hover:bg-accent"
      >
        <ListChecks className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{headlineOf(list.tasks, t)}</span>
        <Chevron className="size-3.5 shrink-0" aria-hidden />
      </button>
    </section>
  );
}
