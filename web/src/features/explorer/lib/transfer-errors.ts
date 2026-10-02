import { AppError } from '@/shared/api/errors';
import { formatBytes } from '@/features/editor';
import type { CeilingRefusal } from './upload-plan';

/** The sentence of a ceiling, by what it measured — named in full, for the i18n check to see. */
const CEILING_KEYS = {
  download: {
    bytes: 'explorer.transfer.downloadTooLarge',
    entries: 'explorer.transfer.archiveTooManyEntries',
  },
  upload: { bytes: 'explorer.transfer.uploadTooLarge', entries: 'explorer.transfer.tooManyFiles' },
} as const;

/** A measure for a person: bytes in their units, a count as a number. */
function amount(measure: 'bytes' | 'entries', value: number, locale: string): string {
  return measure === 'bytes'
    ? formatBytes(value, locale)
    : new Intl.NumberFormat(locale).format(value);
}

function numberOf(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * A ceiling refused here, before a byte moved, as the error the outcome screen tells — with the
 * ceiling in the person's units (S-321).
 */
export function refusalError(refusal: CeilingRefusal, locale: string): AppError {
  return new AppError('FILE_TOO_LARGE', refusal.messageKey, 'local', {
    limit: amount(refusal.measure, refusal.limit, locale),
    size: amount(refusal.measure, refusal.actual, locale),
  });
}

/**
 * A refusal of the server for a transfer, in the words of a transfer: a ceiling (`413`) says which,
 * and how far it goes — the server's own sentence for it is the editor's. Any other is as it came.
 */
export function transferError(
  error: AppError,
  kind: keyof typeof CEILING_KEYS,
  locale: string,
): AppError {
  if (error.code !== 'FILE_TOO_LARGE') {
    return error;
  }

  const measure = error.params['measure'] === 'entries' ? 'entries' : 'bytes';

  return new AppError(error.code, CEILING_KEYS[kind][measure], error.traceId, {
    ...error.params,
    limit: amount(measure, numberOf(error.params['limit']), locale),
    size: amount(measure, numberOf(error.params['size']), locale),
  });
}
