import { DomainError } from '@domain/shared';

/**
 * An effort level the model of the session does not take — it takes none, or not that one.
 *
 * `INVALID_INPUT`, with the model and the level, so the screen can say which (plan 08, D-16).
 */
export class EffortUnsupportedError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'session.error.effortUnsupported';

  constructor(level: string, model: string) {
    super(`model ${model} does not take effort ${level}`, { level, model });
  }
}
