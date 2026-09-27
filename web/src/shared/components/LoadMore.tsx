import { useTranslation } from 'react-i18next';

import type { AppError } from '@/shared/api/errors';
import { Button } from '@/shared/components/ui/button';

export interface LoadMoreProps {
  /** Whether there is a page after the ones on screen. Nothing renders when there is not. */
  readonly hasMore: boolean;

  readonly isLoading: boolean;

  /** Why the last attempt failed. Shown beside the button, and nothing on screen goes away. */
  readonly error: AppError | null;

  onLoadMore(): void;

  /** Already translated: what the button says, and what it says while the page is on its way. */
  readonly label: string;
  readonly loadingLabel: string;
}

/**
 * The way to the next page of a list, and why it failed when it did.
 *
 * A failure here is not the list failing: every row already read is still true, so it stays, and
 * the reason goes beside the button rather than in place of the content. Written once because
 * three paged screens do it, and the copy that is not written every day is the one that replaces
 * what is on screen with an error.
 */
export function LoadMore({
  hasMore,
  isLoading,
  error,
  onLoadMore,
  label,
  loadingLabel,
}: LoadMoreProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      {hasMore && (
        <Button
          variant="outline"
          size="touch"
          className="self-start"
          disabled={isLoading}
          onClick={onLoadMore}
        >
          {isLoading ? loadingLabel : label}
        </Button>
      )}

      {error !== null && (
        <p className="text-xs text-destructive" role="alert">
          {t(error.messageKey, error.params)}
        </p>
      )}
    </>
  );
}
