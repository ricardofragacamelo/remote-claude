import type { UserId } from '@domain/auth';
import type { PermissionDecision, PersistedPermissionScope } from '@domain/permission';

/** One rule somebody asked for — from an approval card, or from the rules API. */
export interface GrantPermissionRuleCommand {
  readonly userId: UserId;

  /** In the canonical grammar — `shell(git status:*)`. Validated by the domain, not here. */
  readonly pattern: string;

  /** The engine the rule is restricted to; absent or `null` for every engine with the kind. */
  readonly engine?: string | null;

  readonly decision: PermissionDecision;
  readonly scope: PersistedPermissionScope;

  /** The workspace root. Required for `project`, ignored for `always`. */
  readonly projectPath: string | null;

  /** `null` means the configured default. Past the configured ceiling is refused, never cut. */
  readonly expiresAt: Date | null;
}
