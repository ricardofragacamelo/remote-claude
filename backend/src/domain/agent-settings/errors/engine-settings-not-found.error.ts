import { DomainError } from '@domain/shared';

/**
 * The settings of an engine this installation does not drive — not registered, or not enabled.
 * `404`: there is nothing there to read or write, the same answer for a name that never existed.
 */
export class EngineSettingsNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly messageKey = 'common.error.notFound';

  constructor(engine: string) {
    super(`no enabled engine is named ${engine}`, { engine });
  }
}
