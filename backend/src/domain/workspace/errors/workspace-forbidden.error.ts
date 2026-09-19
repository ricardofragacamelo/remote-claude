import { DomainError } from '@domain/shared';

/**
 * The root exists on this machine, and it is not this user's to open.
 *
 * `403`, and distinct from `WORKSPACE_NOT_ALLOWED` in the question it answers: that one is "no
 * configured root contains this path at all", this one is "one does, and it is declared for
 * somebody else". Both are refusals of the same kind — authenticated, and still not permitted —
 * and both are `403` ([D-17](../../../../../docs/plans/01-live-session/decisions.md)).
 */
export class WorkspaceForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly messageKey = 'workspace.error.forbidden';

  constructor(path: string) {
    super(`${path} is under a root declared for somebody else`, { path });
  }
}
