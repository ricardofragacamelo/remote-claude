import type { UserId } from '@domain/auth';
import type {
  PermissionDecision,
  PermissionRuleOrigin,
  PersistedPermissionScope,
} from '@domain/permission';

/**
 * The workspace a `project` rule names.
 *
 * `trusted` is a path resolved elsewhere, against the allowlist, moments ago — the card's own
 * session. `raw` is one this call must resolve itself, through `RuleFolderResolver`, because it
 * came from outside and nothing has checked it yet (`POST`, import, restore, a template).
 */
export type GrantedProjectPath = { readonly trusted: string } | { readonly raw: string };

/** One rule somebody asked for — from an approval card, or from the rules API. */
export interface GrantPermissionRuleCommand {
  readonly userId: UserId;

  /** In the canonical grammar — `shell(git status:*)`. Validated by the domain, not here. */
  readonly pattern: string;

  /** The engine the rule is restricted to; absent or `null` for every engine with the kind. */
  readonly engine?: string | null;

  readonly decision: PermissionDecision;
  readonly scope: PersistedPermissionScope;

  /** The workspace root. `null` for `always`; required for `project` — see {@link GrantedProjectPath}. */
  readonly projectPath: GrantedProjectPath | null;

  /** `null` means the configured default. Past the configured ceiling is refused, never cut. */
  readonly expiresAt: Date | null;

  /**
   * Required for `allow`: `true` says the caller has seen and accepted a `broad` pattern.
   * `unbounded` is refused outright, whatever this says ([15 · D-09](../../../../docs/plans/15-rules-management/decisions.md#d-09--o-que-é-largo-demais)).
   * Ignored for `deny`, which is never too broad.
   */
  readonly acknowledgeBroad?: boolean;

  /** How this rule comes to exist — recorded, never guessed ([15 · D-16 · S-35]). */
  readonly grantedVia: PermissionRuleOrigin;

  /** The permission request a card's `approval` answers. Set only then. */
  readonly grantedFromRequestId?: string | null;

  /** The catalog template this rule comes from, when `grantedVia` is `request` with one chosen. */
  readonly templateId?: string | null;

  /** The revoked rule this one undoes, when `grantedVia` is `restore`. */
  readonly restoredFrom?: string | null;
}
