import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '../value-objects/workspace-path.value-object';

/** What declaring a root in the allowlist file amounts to. */
export interface WorkspaceDeclaration {
  readonly root: WorkspacePath;
  readonly label: string;
  /** OIDC subjects allowed to reach this root. Never empty — a root nobody may use is a typo. */
  readonly authorisedUsers: readonly string[];
}

/**
 * A root the operator has allowed, and who may use it.
 *
 * It is born from the allowlist file, never from the database and never from the UI: changing it
 * has to mean touching the disk of the machine. See docs/plans/01-live-session/decisions.md#d-02.
 *
 * The root carries its own users because an allowlist that is global stops being an allowlist the
 * moment a second person signs in — the scope would exist in the audit trail and in the
 * permission rules but not in the access, which is where it matters (D-13).
 */
export class Workspace {
  private constructor(
    readonly root: WorkspacePath,
    readonly label: string,
    readonly authorisedUsers: readonly string[],
    /** When this user last opened something under the root, or `null` if never. */
    readonly lastUsedAt: Date | null,
  ) {}

  /** A root as the allowlist file declares it, with no usage history yet attached. */
  static declare(declaration: WorkspaceDeclaration): Workspace {
    return new Workspace(
      declaration.root,
      declaration.label,
      [...declaration.authorisedUsers],
      null,
    );
  }

  /** The same root, carrying the instant a given user last used it. */
  usedAt(instant: Date | null): Workspace {
    return new Workspace(this.root, this.label, this.authorisedUsers, instant);
  }

  /** Whether `userId` is one of the subjects the file listed for this root. */
  allows(userId: UserId): boolean {
    return this.authorisedUsers.includes(userId.value);
  }

  /** Whether `path` is this root or lives underneath it. */
  contains(path: WorkspacePath): boolean {
    return path.isWithin(this.root);
  }
}
