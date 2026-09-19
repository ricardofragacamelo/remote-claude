import { DomainError } from '@domain/shared';

/**
 * The trail could not be written, so nothing is authorised.
 *
 * Without a trail there is no authorisation — the rule, not a precaution: a system that runs
 * `Bash` on somebody's machine and cannot say afterwards what it ran has already failed at the
 * one thing it promised. See docs/architecture/backend/03-modules.md#audit.
 *
 * `INTERNAL_ERROR`, because it is ours: the caller did nothing wrong, and a `4xx` here would
 * blame them for our database.
 */
export class AuditUnavailableError extends DomainError {
  readonly code = 'INTERNAL_ERROR';
  readonly messageKey = 'audit.error.unavailable';

  constructor(
    readonly consecutiveFailures: number,
    /** What the database said. `override` because `Error` already declares a `cause`. */
    override readonly cause: unknown,
  ) {
    super(`the audit trail could not be written (${String(consecutiveFailures)} in a row)`, {
      consecutiveFailures,
    });
  }
}
