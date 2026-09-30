import { useTranslation } from 'react-i18next';

import { ListStatus } from '@/shared/components/ListStatus';
import { Panel } from '@/shared/components/Panel';
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

  /** What goes above the rows — a search box — shown only with the content. */
  readonly before?: React.ReactNode;

  /** The next step out of the empty state, as something to press. */
  readonly emptyAction?: React.ReactNode;

  /** What goes below the panel's state, whichever it is — a way to get more into the list. */
  readonly footer?: React.ReactNode;

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
  emptyAction,
  before,
  footer,
  children,
}: LoadedListProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Panel title={t(keys.title)} description={t(keys.description)}>
      <ListStatus
        isLoading={isLoading}
        loadingLabel={t(keys.loading)}
        error={error}
        onRetry={onRetry}
        isEmpty={isEmpty}
        emptyTitle={t(keys.emptyTitle)}
        emptyDescription={t(keys.emptyDescription)}
        emptyAction={emptyAction}
      />

      {!isLoading && error === null && !isEmpty && (
        <>
          {before}
          {/* Labelled by the same key as the panel: a list a screen reader reaches without a name is
              a list it announces as "list". */}
          <ul className="flex flex-col gap-2" aria-label={t(keys.title)}>
            {children}
          </ul>
        </>
      )}

      {footer}
    </Panel>
  );
}
