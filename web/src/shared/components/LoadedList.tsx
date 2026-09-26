import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { ErrorState } from '@/shared/components/ErrorState';
import { Panel } from '@/shared/components/Panel';
import { Skeleton } from '@/shared/components/ui/skeleton';
import type { AppError } from '@/shared/api/errors';

/**
 * The five keys a loading list needs, as **keys** rather than as sentences.
 *
 * They travel unresolved so each screen can name them as literals in one place, which is what the
 * orphan check reads: a key reached only through a computed prefix is a key nobody can prove is in
 * use (docs/architecture/shared/02-i18n.md).
 */
export interface ListKeys {
  readonly title: string;
  readonly description: string;

  /** What a screen reader is told while the request is in flight. */
  readonly loading: string;

  /** The empty state says what to do next. "No data" on its own reads as a bug. */
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

export interface LoadedListProps {
  readonly keys: ListKeys;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly isEmpty: boolean;

  onRetry(): void;

  /** The `<li>` elements. Rendered only when there is something to show. */
  readonly children: React.ReactNode;
}

/**
 * A panel that loads a list: the four states, in one place.
 *
 * Loading, error, empty and content — every screen of this product that reads something owes all
 * four, and the missing one is always the one a user eventually sees
 * (docs/architecture/web/03-ui-system.md). Writing them per screen is how two screens come to
 * disagree about what "loading" looks like, and how the fourth one goes missing.
 *
 * The states are exclusive by construction rather than by four `&&` chains each screen has to get
 * right, and an error **replaces** the content: leaving the previous list on screen says it is
 * still true, and the next click would act on something that is not.
 */
export function LoadedList({
  keys,
  isLoading,
  error,
  isEmpty,
  onRetry,
  children,
}: LoadedListProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Panel title={t(keys.title)} description={t(keys.description)}>
      {isLoading && <Skeleton className="h-24 w-full" aria-label={t(keys.loading)} />}

      {!isLoading && error !== null && <ErrorState error={error} onRetry={onRetry} />}

      {!isLoading && error === null && isEmpty && (
        <EmptyState title={t(keys.emptyTitle)} description={t(keys.emptyDescription)} />
      )}

      {!isLoading && error === null && !isEmpty && (
        // Labelled by the same key as the panel: a list a screen reader reaches without a name is
        // a list it announces as "list".
        <ul className="flex flex-col gap-2" aria-label={t(keys.title)}>
          {children}
        </ul>
      )}
    </Panel>
  );
}
