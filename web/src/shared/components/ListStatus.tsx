import { EmptyState } from '@/shared/components/EmptyState';
import { LoadStatus } from '@/shared/components/LoadStatus';
import type { AppError } from '@/shared/api/errors';

export interface ListStatusProps {
  readonly isLoading: boolean;

  /** Already translated: what a screen reader is told while the request is in flight. */
  readonly loadingLabel: string;

  readonly error: AppError | null;
  onRetry(): void;

  readonly isEmpty: boolean;

  /** Already translated. The empty state says what to do next — "no data" reads as a bug. */
  readonly emptyTitle: string;
  readonly emptyDescription: string;

  /** The next step out of the empty state, as something to press. */
  readonly emptyAction?: React.ReactNode;

  /** How many rows the skeleton holds the place of; one block when it is not a list of rows. */
  readonly rows?: number;
}

/**
 * Whatever a list is when it is not its rows: loading, failed, or empty — and nothing at all once
 * there are rows to show.
 *
 * Three of the four normative states (docs/architecture/web/03-ui-system.md), exclusive by
 * construction: loading and failed are `LoadStatus`'s, and the empty one is added here. Written once
 * because a panel and a dialog both owe them, and the copy that is not written every day is the one
 * that forgets the empty state. An error **replaces** the rows: leaving the previous ones on screen
 * says they are still true.
 */
export function ListStatus({
  isLoading,
  loadingLabel,
  error,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  rows,
}: ListStatusProps): React.JSX.Element | null {
  if (isLoading || error !== null) {
    return (
      <LoadStatus
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        error={error}
        onRetry={onRetry}
        {...(rows === undefined ? {} : { rows })}
      />
    );
  }

  return isEmpty ? (
    <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
  ) : null;
}
