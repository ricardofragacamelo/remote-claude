import { AppError } from '@/shared/api/errors';

/**
 * A failure as the screen says it: an `AppError` as it came, anything else as the unexpected — so a
 * refused item always carries a key the screen can translate.
 */
export function asAppError(error: unknown, traceId: string): AppError {
  return error instanceof AppError
    ? error
    : new AppError('INTERNAL_ERROR', 'common.error.unexpected', traceId);
}
