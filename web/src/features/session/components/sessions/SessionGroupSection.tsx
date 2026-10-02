import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import type { ErrorStateProps } from '@/shared/components/ErrorState';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import type { SessionsView } from '../../hooks/useSessionsView';
import type { SessionGroup } from '../../types/sessions-view';

/** What a group shows, in which of its four states (docs/architecture/web/03-ui-system.md). */
export interface GroupContent {
  readonly group: SessionGroup;
  readonly count: number;
  readonly isLoading: boolean;
  readonly error: ErrorStateProps['error'] | null;
  onRetry(): void;
  readonly children: ReactNode;

  /** Below the rows: "load more", for the history. */
  readonly footer?: ReactNode;
}

/** A group of the view, and the view it is part of. */
interface GroupProps {
  readonly view: SessionsView;
  readonly content: GroupContent;
}

/**
 * One group of the view, folded or not, with the four states of its own: a failure of the history
 * does not hide what runs here, and the reverse (S-35). The empty state teaches the next step, and
 * says when a filter is what emptied it — with the way to clear it (S-36).
 */
export function SessionGroupSection({ view, content }: GroupProps): React.JSX.Element {
  const { t } = useTranslation();
  const { group } = content;
  const collapsed = view.state.collapsed.has(group);
  const headingId = `sessions-${group}-${view.folder}`;
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h3 id={headingId}>
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => {
            view.state.toggleGroup(group);
          }}
          className="flex w-full items-center gap-1 px-2 py-1 text-ui-xs font-ui-strong tracking-wide uppercase"
        >
          <Chevron className="size-3.5" aria-hidden />
          {t(`sessionsGroup.${group}.title`)}
          <span className="ml-auto font-normal">{content.count}</span>
        </button>
      </h3>
      {!collapsed && <GroupBody view={view} content={content} />}
    </section>
  );
}

function GroupBody({ view, content }: GroupProps): React.JSX.Element {
  const { t } = useTranslation();
  const { group } = content;

  if (content.isLoading) {
    return <Skeleton className="mx-2 h-10" aria-label={t(`sessionsGroup.${group}.loading`)} />;
  }

  if (content.error !== null) {
    return <ErrorState error={content.error} onRetry={content.onRetry} />;
  }

  if (content.count === 0) {
    return view.isFiltered ? (
      <EmptyState
        title={t('sessions.filtered.title')}
        description={t('sessions.filtered.description')}
        action={
          <Button variant="outline" onClick={view.state.clearFilters}>
            {t('sessions.filtered.clear')}
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={t(`sessionsGroup.${group}.emptyTitle`)}
        description={t(`sessionsGroup.${group}.emptyDescription`)}
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-0.5 px-1">{content.children}</ul>
      {content.footer}
    </>
  );
}
