import { ErrorState } from '@/shared/components/ErrorState';
import { Skeleton } from '@/shared/components/ui/skeleton';
import type { AppError } from '@/shared/api/errors';

export interface LoadStatusProps {
  readonly isLoading: boolean;

  /** Already translated: what a screen reader is told while the request is in flight. */
  readonly loadingLabel: string;

  readonly error: AppError | null;
  onRetry(): void;

  /** How many rows the skeleton holds the place of; one block when it is not a list of rows. */
  readonly rows?: number;
}

/**
 * What a read is while it is not its content: loading, or failed with the way to try again — and
 * nothing once the answer is in.
 *
 * Two of the four normative states (docs/architecture/web/03-ui-system.md), exclusive by
 * construction, for a panel whose content is not a list — the versions of About. A list owes a third,
 * the empty state, and takes it from `ListStatus`, which is built on this.
 */
export function LoadStatus({
  isLoading,
  loadingLabel,
  error,
  onRetry,
  rows,
}: LoadStatusProps): React.JSX.Element | null {
  if (isLoading) {
    return rows === undefined ? (
      <Skeleton className="h-24 w-full" aria-label={loadingLabel} />
    ) : (
      <div className="flex flex-col gap-2" role="status" aria-label={loadingLabel}>
        {Array.from({ length: rows }, (_, row) => (
          <Skeleton key={row} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  return error === null ? null : <ErrorState error={error} onRetry={onRetry} />;
}
