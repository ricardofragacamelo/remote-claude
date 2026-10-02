import { Circle, CircleCheck, LoaderCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

/**
 * The task list Claude keeps, pinned at the top of the conversation (plan 08, B-20): pending, in
 * progress, completed, how many are done — and, after each change, which tasks it moved and from
 * where (S-87). Nothing when there is no list, or the last `TodoWrite` emptied it (S-86).
 */
export function TaskListPanel({ list }: { readonly list: TaskList }): React.JSX.Element | null {
  const { t } = useTranslation();

  if (list.items.length === 0) {
    return null;
  }

  const done = list.items.filter((item) => item.state === 'completed').length;

  return (
    <section
      aria-label={t('sessions.tasks.label')}
      className="sticky top-0 z-10 flex flex-col gap-1 rounded-md border border-border bg-background p-2"
    >
      <h3 className="flex items-baseline justify-between text-ui-xs font-ui-strong uppercase">
        {t('sessions.tasks.title')}
        <span className="font-normal normal-case text-muted-foreground">
          {t('sessions.tasks.count', { done, total: list.items.length })}
        </span>
      </h3>
      <ul className="flex flex-col gap-0.5">
        {list.items.map((item) => (
          <TaskRow key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}
