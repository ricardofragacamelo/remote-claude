import { AppError } from '@/shared/api/errors';
import { newTraceId } from '@/shared/lib/trace';
import { logger } from '@/shared/logging/logger';
import type { HistoryAuthor, HistoryReason, KeptEntry } from '../types/history';

/** How many characters of somebody else's identity the Timeline shows. */
const SHORT_ID = 8;

/** A failure as the Timeline shows it — anything that is not the server's answer is "unexpected". */
export function asHistoryError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  logger.warn({ op: 'fileHistory.request', err: String(error) }, 'local history request failed');
  return new AppError('INTERNAL_ERROR', 'common.error.unexpected', newTraceId());
}

/**
 * Who wrote a version, as the Timeline says it: "You", or "Another person" with the start of the
 * identity the server knows — there is no name kept anywhere (07 · B-55, S-350).
 */
export function authorOf(author: HistoryAuthor): {
  readonly key: string;
  readonly params: Readonly<Record<string, string>>;
} {
  return author.self
    ? { key: 'fileHistory.author.self', params: {} }
    : { key: 'fileHistory.author.other', params: { id: author.id.slice(0, SHORT_ID) } };
}

/** What each reason is called — named in full so the i18n check sees each key. */
export const REASON_KEYS: Readonly<Record<HistoryReason, string>> = {
  save: 'fileHistory.reason.save',
  delete: 'fileHistory.reason.delete',
  restore: 'fileHistory.reason.restore',
  upload: 'fileHistory.reason.upload',
};

/** What the filter calls each reason. */
export const FILTER_KEYS: Readonly<Record<HistoryReason, string>> = {
  save: 'fileHistory.filter.save',
  delete: 'fileHistory.filter.delete',
  restore: 'fileHistory.filter.restore',
  upload: 'fileHistory.filter.upload',
};

/** When a version was kept, in the person's language. */
export function whenOf(at: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(at),
  );
}

/** How deep a path is — a folder is restored before what is inside it. */
function depthOf(path: string): number {
  return path.split('/').length;
}

/**
 * The order an undone delete is restored in: every folder before the files inside it — by depth,
 * and at one depth folders first — so each file finds its folder there.
 */
export function restoreOrder(entries: readonly KeptEntry[]): readonly KeptEntry[] {
  return [...entries].sort(
    (a, b) =>
      depthOf(a.path) - depthOf(b.path) ||
      Number(a.entryKind === 'file') - Number(b.entryKind === 'file'),
  );
}
