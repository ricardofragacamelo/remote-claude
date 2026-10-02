import type { ReactNode } from 'react';

import { DiffHunks } from '@/shared/components/DiffHunks';
import type { DiffHunksProps } from '@/shared/components/DiffHunks';
import { LoadStatus } from '@/shared/components/LoadStatus';
import type { Hunk } from '@/shared/lib/diff-hunk';
import type { Loaded } from '../../hooks/loaded';

export interface LoadedHunksProps<T extends { readonly hunks: readonly Hunk[] }> {
  readonly loaded: Loaded<T>;

  /** What a screen reader is told while it loads — translated. */
  readonly loadingLabel: string;

  /** What the diff is — its accessible name, translated. */
  readonly label: string;
  readonly foldAfter?: number;
  readonly actions?: DiffHunksProps['actions'];

  /** What is said, besides the hunks, once it is in — notes about a side, the way to the editor. */
  readonly children?: (data: T) => ReactNode;

  /** What is said when there is no hunk at all. */
  readonly empty?: ReactNode;
}

/**
 * A diff that is read from the server: loading, failed with the way to try again, or its hunks —
 * the diff of a tool in the chat and a file of the changes alike (plan 08, B-27, B-28).
 */
export function LoadedHunks<T extends { readonly hunks: readonly Hunk[] }>({
  loaded,
  loadingLabel,
  label,
  foldAfter,
  actions,
  children,
  empty,
}: LoadedHunksProps<T>): React.JSX.Element {
  const { data } = loaded;

  if (data === null) {
    return (
      <LoadStatus
        isLoading={loaded.isLoading}
        loadingLabel={loadingLabel}
        error={loaded.error}
        onRetry={loaded.retry}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {children?.(data)}
      {data.hunks.length === 0 ? (
        empty
      ) : (
        <DiffHunks hunks={data.hunks} label={label} foldAfter={foldAfter} actions={actions} />
      )}
    </div>
  );
}
