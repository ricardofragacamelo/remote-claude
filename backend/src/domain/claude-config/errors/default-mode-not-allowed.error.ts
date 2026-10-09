import { DomainError } from '@domain/shared';

/**
 * `bypassPermissions` as a default. It switches the approval off, so it is never something a session
 * starts with unasked — the static rule of 09-code-quality, now for the data too. `422`.
 */
export class DefaultModeNotAllowedError extends DomainError {
  readonly code = 'DEFAULT_MODE_NOT_ALLOWED';
  readonly messageKey = 'claudeConfig.error.defaultModeNotAllowed';

  constructor(mode: string) {
    super(`${mode} can never be a default`, { mode });
  }
}
