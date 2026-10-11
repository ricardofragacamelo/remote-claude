import type { PermissionDecision, PersistedScope } from './permission';

/**
 * Whether a rule still answers.
 *
 * Computed by the server at the moment it answers, never here: the list shows an expired rule
 * marked rather than missing, and that cannot depend on the clock of whatever device is looking.
 * A revoked rule is not listed at all — "gone" and "no longer valid" are different things to
 * somebody looking for what they authorised — but it still opens by id, from the trail entry it
 * answered, and then it says it was revoked
 * ([D-18](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export type RuleStatus = 'active' | 'expired' | 'revoked' | 'disabled';

/**
 * Why a rule stopped answering on its own: it was written for an agent in a form this version cannot
 * carry over to the canonical grammar, so it was kept, disabled, for the person to see and create
 * again (plan 28, D-18). `reason` is a code (`untranslatable`), never a sentence.
 */
export interface RuleDisabled {
  readonly reason: string;
}

/**
 * Something the user authorised in advance, as the rules screen knows it.
 *
 * `always` means, in practice, "don't ask me again" — which is why every field that says how far
 * it reaches is here, and why none of them is optional.
 */
export interface PermissionRule {
  readonly id: string;
  readonly scope: PersistedScope;

  /**
   * The kind of call the rule answers (`shell`, `file.edit`), as the server read it from the pattern.
   * `null` on a disabled rule, whose pattern was never carried over.
   */
  readonly kind: string | null;

  /**
   * Exactly as granted, in the canonical grammar: `shell(git status:*)`. Opaque here — the server
   * parses it, the screen shows it as written. A disabled rule keeps the pattern it was written with.
   */
  readonly pattern: string;

  readonly decision: PermissionDecision;

  /** The workspace root a `project` rule is confined to; `null` on `always`. */
  readonly projectPath: string | null;

  /** Who granted it. Always the person looking, since nobody sees another person's rules. */
  readonly grantedBy: string;

  /** ISO 8601. */
  readonly grantedAt: string;
  readonly expiresAt: string;

  readonly status: RuleStatus;

  /** ISO 8601, when it was taken back. `null` while it has not been. */
  readonly revokedAt: string | null;

  /** The engine the rule is restricted to; `null` when it holds for every agent with the kind. */
  readonly engine: string | null;

  /** Why it answers nothing any more, when it was disabled; `null` otherwise. */
  readonly disabled: RuleDisabled | null;
}

/** A rule on screen: the rule, and whether it is about to stop answering. */
export interface ListedRule {
  readonly rule: PermissionRule;

  /**
   * Fewer than seven days left. Without the warning, a session starts asking again with no
   * explanation — the convenience is lost and the loss is not explained
   * ([D-13](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
   */
  readonly expiringSoon: boolean;
}

/**
 * What a row says when revoking it failed: the key and its parameters, and nothing of the
 * transport. An `AppError` fits it; the component never has to know that type exists.
 */
export interface RowFailure {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, unknown>>;
}
