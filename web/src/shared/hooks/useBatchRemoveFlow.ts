import { useState } from 'react';

import type { BatchItemResult, BatchTarget } from '@/shared/lib/settled-batch';

/** The destructive confirm of removing one or many rows of [T] — a generic batch remove flow. */
export interface BatchRemoveFlow<T extends BatchTarget> {
  readonly targets: readonly T[] | null;
  readonly pending: boolean;
  ask(targets: readonly T[]): void;
  confirm(): Promise<readonly BatchItemResult[]>;
  cancel(): void;
}

/**
 * Removing is destructive and for good — a confirm with no undo (S-135): a batch of more than one
 * is one confirm, one request per row, each outcome told on its own (S-134). Shared by `mcp`'s own
 * `useRemoveFlow` and an engine extension's own `useRemovePluginFlow` (plan 13, B-28, B-29), which each
 * only name the mutation to run and the row type.
 */
export function useBatchRemoveFlow<T extends BatchTarget>(
  removeMany: (targets: readonly T[]) => Promise<readonly BatchItemResult[]>,
): BatchRemoveFlow<T> {
  const [targets, setTargets] = useState<readonly T[] | null>(null);
  const [pending, setPending] = useState(false);

  return {
    targets,
    pending,
    ask: (next) => {
      setTargets(next);
    },
    confirm: async () => {
      if (targets === null) {
        return [];
      }
      setPending(true);
      try {
        const results = await removeMany(targets);
        setTargets(null);
        return results;
      } finally {
        setPending(false);
      }
    },
    cancel: () => {
      if (!pending) {
        setTargets(null);
      }
    },
  };
}
