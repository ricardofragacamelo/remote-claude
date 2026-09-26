import type { UserId } from '@domain/auth';
import type { Workspace } from '../entities/workspace.entity';
import { WorkspaceNotAllowedError } from '../errors/workspace-not-allowed.error';
import { WorkspaceForbiddenError } from '../errors/workspace-forbidden.error';
import { InvalidWorkspacePathError } from '../errors/invalid-workspace-path.error';
import { WorkspacePath } from '../value-objects/workspace-path.value-object';

/**
 * The roots this installation allows, and the rule that decides whether a path is one of them.
 *
 * Pure and without I/O, which is deliberate: this is the cheapest place in the project to get
 * security right, and a rule with no filesystem in it cannot be raced, cannot be slow and cannot
 * fail for a reason unrelated to the decision. Existence and directory-ness are asked one layer
 * out — see `ResolveWorkspaceUseCase`.
 */
export class WorkspaceAllowlist {
  constructor(private readonly workspaces: readonly Workspace[]) {}

  /** The roots `userId` may use, in the order the file declared them. */
  for(userId: UserId): readonly Workspace[] {
    return this.workspaces.filter((workspace) => workspace.allows(userId));
  }

  /**
   * The root a path belongs to.
   *
   * The two refusals are different codes and the **same status**, because they are the same kind
   * of answer: authenticated, and still not permitted. `WORKSPACE_NOT_ALLOWED` is "no configured
   * root contains this at all"; `FORBIDDEN` is "one does, and it is declared for somebody else".
   * Both `403` ([D-17](../../../../../docs/plans/01-live-session/decisions.md)).
   *
   * The earlier design answered `404` for the second, to avoid confirming that a directory the
   * caller must not know about exists. That was a semantics of its own, and it is gone.
   *
   * @param raw the candidate path, as it arrived from the outside
   * @throws {import('../errors/invalid-workspace-path.error').InvalidWorkspacePathError} when the
   *   path is empty, relative or contains a NUL byte — before any root is even consulted
   * @throws {WorkspaceNotAllowedError} when no configured root contains it
   * @throws {WorkspaceForbiddenError} when the root that contains it is not this user's
   */
  resolve(raw: string, userId: UserId): ResolvedWorkspace {
    const path = WorkspacePath.create(raw);
    const workspace = this.workspaces.find((candidate) => candidate.contains(path));

    if (workspace === undefined) {
      throw new WorkspaceNotAllowedError(path.value);
    }

    if (!workspace.allows(userId)) {
      throw new WorkspaceForbiddenError(path.value);
    }

    return { path, workspace };
  }

  /**
   * Whether `raw` is a path `userId` may reach — {@link resolve} as a question, for a caller that
   * filters rather than refuses.
   *
   * A path that is not a path at all is simply not admitted. Only the refusals of this rule are
   * turned into `false`; anything else it could throw is a bug and still propagates.
   */
  admits(raw: string, userId: UserId): boolean {
    try {
      this.resolve(raw, userId);
      return true;
    } catch (error) {
      if (
        error instanceof InvalidWorkspacePathError ||
        error instanceof WorkspaceNotAllowedError ||
        error instanceof WorkspaceForbiddenError
      ) {
        return false;
      }

      throw error;
    }
  }
}

/** A path that cleared the allowlist, and the root it cleared under. */
export interface ResolvedWorkspace {
  readonly path: WorkspacePath;
  readonly workspace: Workspace;
}
