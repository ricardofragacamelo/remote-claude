import { DomainError } from '@domain/shared';

/**
 * A mode outside the canonical ones as a default — an engine's own mode that switches the approval
 * off. It is never something a session starts with unasked: the static rule of 09-code-quality, now
 * for the data too. `422`.
 */
export class DefaultModeNotAllowedError extends DomainError {
  readonly code = 'DEFAULT_MODE_NOT_ALLOWED';
  readonly messageKey = 'agentSettings.error.defaultModeNotAllowed';

  constructor(mode: string) {
    super(`${mode} can never be a default`, { mode });
  }
}
