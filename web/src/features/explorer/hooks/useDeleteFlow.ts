import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { KeptEntry } from '@/features/file-history';
import { asExplorerError, runEach } from '../lib/batch';
import type { ItemResult } from '../lib/batch';
import { isWithin, outermost, parentOf } from '../lib/paths';
import { deleteEntry } from '../services/explorer.service';
import { explorerStore } from '../store/explorer.store';
import type { ExplorerError } from '../types/explorer';
import { forgetUnder, reread } from './file-operations';
import type { FolderContext } from './file-operations';
import { keptRound, notifyKept } from './kept-delete';
import type { NotKept } from './kept-delete';
import type { SensitiveRequest } from './useOutcome';

/** A folder with something in it: how much goes with it, as the `409` counted it. */
export interface CountedFolder {
  readonly path: string;
  readonly entryCount: number;

  /** The count stopped at the ceiling: at least this many. */
  readonly capped: boolean;
}

/**
 * Where a delete is that the local history could not keep: asked for good — saying why there is no
 * undo this time —, and for folders with something in it asked again with the count.
 */
export type DeleteStep =
  | {
      readonly step: 'confirm';
      readonly paths: readonly string[];

      /** Why each entry cannot be undone this time (S-337). */
      readonly notKept: readonly NotKept[];

      /** What already went — kept in the history — or failed, told with the rest at the end. */
      readonly done: readonly ItemResult[];

      /** Paths whose second step was already answered (07 · D-15) — not asked twice. */
      readonly confirmed: readonly string[];
    }
  | {
      readonly step: 'count';
      readonly paths: readonly string[];
      readonly counted: readonly CountedFolder[];

      /** Paths that change what Claude may do, which go only with the second step (07 · D-15). */
      readonly sensitive: readonly string[];
      readonly done: readonly ItemResult[];
    };

export interface DeleteFlow {
  readonly current: DeleteStep | null;
  readonly pending: boolean;

  /** Deletes `paths` — kept in the history first, so nothing is asked for what fits (B-58). */
  ask(paths: readonly string[]): void;

  /** The destructive answer — sent once, however many times it is pressed (S-174). */
  confirm(): Promise<void>;
  cancel(): void;
}

/** What the screen around the delete does for it. */
export interface DeleteHandlers {
  /** Told with how each entry went, once nothing is left to ask. */
  finished(results: readonly ItemResult[]): void;

  /** Asks the second step of paths that change what Claude may do (07 · D-15). */
  askSensitive(request: SensitiveRequest): void;

  /** Brings back what a delete kept in the history took away — the notification's "Undo". */
  undo(entries: readonly KeptEntry[]): void;
}

/** What the first definitive request answered about one entry. */
type FirstAnswer =
  | { readonly kind: 'gone' }
  | { readonly kind: 'counted'; readonly folder: CountedFolder }
  | { readonly kind: 'sensitive' }
  | { readonly kind: 'failed'; readonly error: ExplorerError };

async function firstRequest(
  folder: string,
  path: string,
  confirmSensitive: boolean,
): Promise<FirstAnswer> {
  try {
    await deleteEntry(folder, path, confirmSensitive ? { confirmSensitive } : {});
    return { kind: 'gone' };
  } catch (thrown) {
    const error = asExplorerError(thrown);

    if (error.code === 'DIRECTORY_NOT_EMPTY') {
      const count = Number(error.params['entryCount'] ?? 0);
      const capped = error.params['entryCountCapped'] === true;
      return { kind: 'counted', folder: { path, entryCount: count, capped } };
    }

    return error.code === 'PRECONDITION_REQUIRED' && error.params['reason'] === 'sensitiveFile'
      ? { kind: 'sensitive' }
      : { kind: 'failed', error };
  }
}

/** The first definitive round: what went, what needs the count, what needs the second step. */
async function firstRound(folder: string, paths: readonly string[], confirmed: readonly string[]) {
  const done: ItemResult[] = [];
  const counted: CountedFolder[] = [];
  const sensitive: string[] = [];

  for (const path of paths) {
    const answer = await firstRequest(folder, path, confirmed.includes(path));

    if (answer.kind === 'counted') {
      counted.push(answer.folder);
    } else if (answer.kind === 'sensitive') {
      sensitive.push(path);
    } else {
      done.push(
        answer.kind === 'gone' ? { path, ok: true } : { path, ok: false, error: answer.error },
      );
    }
  }

  return { done, counted, sensitive };
}

/** One round of deletes kept in the history, and what follows it. */
type KeepRound = (
  paths: readonly string[],
  confirmSensitive: boolean,
  carried: Carried,
) => Promise<void>;

/** What a delete carries from one round to the next. */
interface Carried {
  readonly done: readonly ItemResult[];
  readonly notKept: readonly NotKept[];
  readonly confirmed: readonly string[];
}

/**
 * Deleting (07 · D-06, B-58). What fits in the local history is kept there and goes **without a
 * question**: a notification says what went, with **Undo** (S-344). What does not fit is not deleted
 * until the person says so — the definitive delete, which says why there is no undo this time
 * (S-337), and for a folder with something in it asks again with how much goes, the count the server
 * gave, sent back so nothing that arrived since goes unseen (S-173). The destructive answer is sent
 * once however many times it is pressed (S-174), and each entry's outcome is told (S-182).
 */
export function useDeleteFlow(context: FolderContext, handlers: DeleteHandlers): DeleteFlow {
  const [current, setCurrent] = useState<DeleteStep | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const latest = useRef(handlers);

  // The round after the second step is the same round again — reached through a ref, as a callback
  // cannot name itself while it is being declared.
  const again = useRef<KeepRound>(() => Promise.resolve());

  useLayoutEffect(() => {
    latest.current = handlers;
  });

  /** The tree after some entries went: their levels forgotten, read again, and off the selection. */
  const cleanUp = useCallback(
    (paths: readonly string[], results: readonly ItemResult[]) => {
      const store = explorerStore(context.folder).getState();
      const gone = results.filter((result) => result.ok).map((result) => result.path);

      for (const path of gone) {
        forgetUnder(context, path);
      }
      reread(context, paths.map(parentOf));

      store.select(
        store.selection.filter((path) => !gone.some((each) => isWithin(path, each))),
        null,
      );
    },
    [context],
  );

  const settle = useCallback(
    (paths: readonly string[], results: readonly ItemResult[]) => {
      cleanUp(paths, results);
      setCurrent(null);
      latest.current.finished(results);
    },
    [cleanUp],
  );

  /** One round kept in the history, and what follows it — the second step, the dialog, or the end. */
  const keepFirst = useCallback(
    async (paths: readonly string[], confirmSensitive: boolean, carried: Carried) => {
      if (sending.current) {
        return;
      }

      sending.current = true;
      setPending(true);
      const round = await keptRound(context.folder, paths, confirmSensitive).finally(() => {
        sending.current = false;
        setPending(false);
      });
      const kept = round.kept.map((each): ItemResult => ({ path: each.path, ok: true }));
      const done = [...carried.done, ...kept, ...round.failed];
      const notKept = [...carried.notKept, ...round.notKept];

      if (kept.length > 0) {
        cleanUp(paths, kept);
        const entries = round.kept.flatMap((each) => each.entries);
        notifyKept(
          kept.map((each) => each.path),
          () => {
            latest.current.undo(entries);
          },
        );
      }

      if (round.sensitive.length > 0) {
        latest.current.askSensitive({
          paths: round.sensitive,
          run: () =>
            again.current(round.sensitive, true, {
              done,
              notKept,
              confirmed: [...carried.confirmed, ...round.sensitive],
            }),
        });
      } else if (notKept.length > 0) {
        setCurrent({
          step: 'confirm',
          paths: notKept.map((each) => each.path),
          notKept,
          done,
          confirmed: carried.confirmed,
        });
      } else {
        settle(paths, done);
      }
    },
    [cleanUp, context.folder, settle],
  );

  useLayoutEffect(() => {
    again.current = keepFirst;
  });

  const confirm = useCallback(async () => {
    if (current === null || sending.current) {
      return;
    }

    sending.current = true;
    setPending(true);

    try {
      if (current.step === 'confirm') {
        const first = await firstRound(context.folder, current.paths, current.confirmed);
        const done = [...current.done, ...first.done];

        if (first.counted.length === 0 && first.sensitive.length === 0) {
          settle(current.paths, done);
        } else {
          setCurrent({ step: 'count', paths: current.paths, ...first, done });
        }
        return;
      }

      const confirmed = await runEach(
        [...current.counted.map((each) => each.path), ...current.sensitive],
        (path) => path,
        (path) =>
          deleteEntry(context.folder, path, {
            confirmSensitive: current.sensitive.includes(path),
            ...countFor(current.counted, path),
          }),
      );
      settle(current.paths, [...current.done, ...confirmed]);
    } finally {
      sending.current = false;
      setPending(false);
    }
  }, [context.folder, current, settle]);

  return {
    current,
    pending,
    ask: (paths) => {
      if (current === null) {
        void keepFirst(outermost(paths), false, { done: [], notKept: [], confirmed: [] });
      }
    },
    confirm,
    cancel: () => {
      if (!sending.current) {
        setCurrent(null);
      }
    },
  };
}

/** The count a folder goes with — none for a file. */
function countFor(counted: readonly CountedFolder[], path: string): { expectedEntries?: number } {
  const folder = counted.find((each) => each.path === path);
  return folder === undefined ? {} : { expectedEntries: folder.entryCount };
}
