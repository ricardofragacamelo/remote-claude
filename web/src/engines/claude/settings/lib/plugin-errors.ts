import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';

/**
 * A failure of this screen's own writes (S-134's same guarantee, for plugins): `api.ts` already
 * turns every HTTP failure into an `AppError`; this only guards against something that is not one
 * at all — a bug in a mock, say — the same way `mcp`'s own `mcpErrorOf` does.
 */
export function pluginErrorOf(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  logger.warn(
    { op: 'plugin.operation', err: String(error) },
    'plugin operation failed unexpectedly',
  );
  return new AppError('INTERNAL_ERROR', 'common.error.unexpected', 'local');
}
