import { DomainError } from '@domain/shared';

/**
 * A diff asked of a tool that writes no file — `Bash`, `Read`, a search.
 *
 * `422`: the request is well formed and the invocation exists, and there is still no diff to give.
 * The tool's name rides along so the screen can say which (plan 08, B-25).
 */
export class DiffNotApplicableError extends DomainError {
  readonly code = 'DIFF_NOT_APPLICABLE';
  readonly messageKey = 'session.error.diffNotApplicable';

  constructor(toolName: string) {
    super(`${toolName} writes no file, so it has no diff`, { toolName });
  }
}
