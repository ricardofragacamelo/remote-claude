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
import type { TaskItem, TaskList, TaskState } from '../../lib/task-list';

/** The icon of each state — beside its word, never instead of it. */
const STATE_ICON: Readonly<Record<TaskState, LucideIcon>> = {
  pending: Circle,
  inProgress: LoaderCircle,
  completed: CircleCheck,
};

/** One task: its state by icon and by word, what it is — or doing — and what it was a moment ago. */
function TaskRow({ item }: { readonly item: TaskItem }): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = STATE_ICON[item.state];
  const state = t(`sessions.taskStatus.${item.state}`);

  return (
    <li
      className={cn(
        'flex items-start gap-1.5 text-ui-sm',
        item.state === 'completed' && 'text-muted-foreground line-through',
        item.was !== null && 'font-ui-strong',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{t('sessions.tasks.state', { state })}</span>
      <span className="min-w-0 flex-1">
        {item.state === 'inProgress' ? item.activeForm : item.title}
      </span>
      {item.was !== null && (
        <span className="shrink-0 text-ui-xs text-muted-foreground no-underline">
          {t('sessions.tasks.was', { state: t(`sessions.taskStatus.${item.was}`) })}
        </span>
      )}
    </li>
  );
}

/** The line the list folds into: where it is, and what is being done — or what is next. */
function headlineOf(items: readonly TaskItem[], t: TFunction): string {
  const done = items.filter((item) => item.state === 'completed').length;
  const doing = items.find((item) => item.state === 'inProgress');
  const next = items.find((item) => item.state === 'pending');

  if (done === items.length) {
    return t('sessions.tasks.allDone', { done, total: items.length });
  }

  return t('sessions.tasks.headline', {
    done,
    total: items.length,
    task: doing?.activeForm ?? next?.title ?? '',
  });
}

/**
 * The task list Claude keeps, above the box (plan 08, B-20; plan 09, B-26, D-14): folded into one
 * line — "3/7 · Running the tests" — that unfolds into the whole list, pending, in progress and
 * completed, with which tasks the last change moved and from where (S-87). Nothing when there is no
 * list, or the last `TodoWrite` emptied it (S-86). It lives outside the conversation, so a list that
 * changes never moves what is being read (S-74).
 */
export function TaskStrip({ list }: { readonly list: TaskList }): React.JSX.Element | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (list.items.length === 0) {
    return null;
  }

  const Chevron = open ? ChevronDown : ChevronUp;

  return (
    <section aria-label={t('sessions.tasks.label')} className="flex min-w-0 flex-col gap-1">
      {open && (
        <ul className="flex max-h-[30cqh] flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-2">
          {list.items.map((item) => (
            <TaskRow key={item.key} item={item} />
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
        <span className="min-w-0 flex-1 truncate">{headlineOf(list.items, t)}</span>
        <Chevron className="size-3.5 shrink-0" aria-hidden />
      </button>
    </section>
  );
}
