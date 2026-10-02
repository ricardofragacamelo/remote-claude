import type { KeptEntry } from '@/features/file-history';
import { notify } from '@/shared/lib/notify';
import { asExplorerError } from '../lib/batch';
import type { ItemResult } from '../lib/batch';
import { nameOf } from '../lib/paths';
import { deleteKeepingHistory } from '../services/explorer.service';
import type { ExplorerError } from '../types/explorer';

/** An entry the local history could not keep — deleted only for good, after asking — and why. */
export interface NotKept {
  readonly path: string;

  /** `tooLarge`, `tooMany` (a folder of too many entries), `unavailable` (the history failed). */
  readonly why: string;
}

/** How one round of deletes kept in the history went. */
export interface KeptRound {
  /** Gone, and in the history: what the "Undo" brings back. */
  readonly kept: readonly { readonly path: string; readonly entries: readonly KeptEntry[] }[];
  readonly notKept: readonly NotKept[];

  /** Paths that change what Claude may do, which go only with the second step (07 · D-15). */
  readonly sensitive: readonly string[];
  readonly failed: readonly ItemResult[];
}

/** What the server answered about one entry. */
type KeptAnswer =
  | { readonly kind: 'kept'; readonly entries: readonly KeptEntry[] }
  | { readonly kind: 'notKept'; readonly why: string }
  | { readonly kind: 'sensitive' }
  | { readonly kind: 'failed'; readonly error: ExplorerError };

/** Why an entry was not kept, as the refusal says it — "unavailable" when it does not say. */
function whyOf(value: unknown): string {
  return typeof value === 'string' ? value : 'unavailable';
}

/** A refusal of a delete kept in the history, read: not kept, the second step, or a failure. */
function answerOf(error: ExplorerError): KeptAnswer {
  if (error.code === 'DIRECTORY_NOT_EMPTY') {
    return { kind: 'notKept', why: whyOf(error.params['notKept']) };
  }

  if (error.code !== 'PRECONDITION_REQUIRED') {
    return { kind: 'failed', error };
  }

  if (error.params['reason'] === 'notKept') {
    return { kind: 'notKept', why: whyOf(error.params['why']) };
  }

  return error.params['reason'] === 'sensitiveFile'
    ? { kind: 'sensitive' }
    : { kind: 'failed', error };
}

async function keepAndDelete(
  folder: string,
  path: string,
  confirmSensitive: boolean,
): Promise<KeptAnswer> {
  try {
    const deletion = await deleteKeepingHistory(folder, path, { confirmSensitive });
    return { kind: 'kept', entries: deletion.entries };
  } catch (thrown) {
    return answerOf(asExplorerError(thrown));
  }
}

/**
 * Deletes each entry keeping it in the local history first (07 · B-58), one after the other, and
 * answers how each went: kept, not kept (asked for good next), asking the second step, or failed.
 * Nothing that does not fit the history is deleted (D-06).
 */
export async function keptRound(
  folder: string,
  paths: readonly string[],
  confirmSensitive: boolean,
): Promise<KeptRound> {
  const kept: { path: string; entries: readonly KeptEntry[] }[] = [];
  const notKept: NotKept[] = [];
  const sensitive: string[] = [];
  const failed: ItemResult[] = [];

  for (const path of paths) {
    const answer = await keepAndDelete(folder, path, confirmSensitive);

    if (answer.kind === 'kept') {
      kept.push({ path, entries: answer.entries });
    } else if (answer.kind === 'notKept') {
      notKept.push({ path, why: answer.why });
    } else if (answer.kind === 'sensitive') {
      sensitive.push(path);
    } else {
      failed.push({ path, ok: false, error: answer.error });
    }
  }

  return { kept, notKept, sensitive, failed };
}

/**
 * Tells what a delete kept in the history took away — in the notification centre, where it stays
 * listed — with **Undo**, which brings every entry of it back (S-344).
 */
export function notifyKept(paths: readonly string[], undo: () => void): void {
  const [only] = paths;
  let undone = false;

  notify({
    severity: 'info',
    ...(paths.length === 1 && only !== undefined
      ? { messageKey: 'notification.files.deletedOne', params: { name: nameOf(only) } }
      : { messageKey: 'notification.files.deletedMany', params: { count: paths.length } }),
    actions: [
      {
        labelKey: 'explorer.delete.undo',
        run: () => {
          // A toast pressed twice, or pressed after the centre's copy was: one undo.
          if (!undone) {
            undone = true;
            undo();
          }
        },
      },
    ],
  });
}
