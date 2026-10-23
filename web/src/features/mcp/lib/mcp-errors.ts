import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';

/**
 * A failure of this feature's own writes, as the screen shows it (S-134): `api.ts` already turns
 * every HTTP failure into an `AppError`, so this only guards against something that is not one at
 * all — a bug in a mock, say — the same way `explorer`'s own batch helper does.
 */
export function mcpErrorOf(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  logger.warn({ op: 'mcp.operation', err: String(error) }, 'mcp operation failed unexpectedly');
  return new AppError('INTERNAL_ERROR', 'common.error.unexpected', 'local');
}
