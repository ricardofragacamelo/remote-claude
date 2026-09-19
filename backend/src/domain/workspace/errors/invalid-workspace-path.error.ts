import { DomainError } from '@domain/shared';

/** Which expectation a candidate path broke. The client translates the fragment, never prose. */
export type WorkspacePathRule = 'mustBeAbsolute' | 'mustNotBeEmpty' | 'mustNotContainNul';

/**
 * A path that is not a path we can even consider.
 *
 * It is `INVALID_INPUT` and not `WORKSPACE_NOT_ALLOWED` on purpose: a relative path was never
 * refused by the allowlist, it was refused before the allowlist was consulted. Resolving it
 * against the working directory of the backend process would silently invent an absolute path
 * nobody asked for — and that invented path could well land inside a root.
 */
export class InvalidWorkspacePathError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'workspace.error.invalidPath';

  /** Every invalid field, as the error envelope carries them. */
  readonly details: readonly { readonly field: string; readonly rule: string }[];

  /**
   * @param raw the candidate, as it arrived from the outside
   * @param rule which expectation it broke
   */
  constructor(raw: string, rule: WorkspacePathRule) {
    super(`"${raw}" is not a usable workspace path: ${rule}`, { path: raw, rule });
    this.details = [{ field: 'path', rule }];
  }
}
