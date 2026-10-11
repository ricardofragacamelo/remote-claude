import { DomainError } from '@domain/shared';

/**
 * A diff asked of a tool call that changes no file the diff can show — a shell command, a read, a
 * search, a cell of a notebook.
 *
 * `422`: the request is well formed and the invocation exists, and there is still no diff to give.
 * The kind rides along so the screen can say which (plan 08, B-25; plan 28, B-17).
 */
export class DiffNotApplicableError extends DomainError {
  readonly code = 'DIFF_NOT_APPLICABLE';
  readonly messageKey = 'session.error.diffNotApplicable';

  constructor(kind: string) {
    super(`a ${kind} call changes no file the diff can show`, { kind });
  }
}
