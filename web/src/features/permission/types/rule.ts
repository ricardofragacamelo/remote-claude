import type { PermissionRule as ContractPermissionRule } from '@remote-claude/contracts';

import type { PersistedScope } from './permission';

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
export type RuleStatus = ContractPermissionRule['status'];

/**
 * Why a rule stopped answering on its own: it was written for an agent in a form this version cannot
 * carry over to the canonical grammar, so it was kept, disabled, for the person to see and create
 * again (plan 28, D-18). `reason` is a code (`untranslatable`), never a sentence.
 */
export type RuleDisabled = NonNullable<ContractPermissionRule['disabled']>;

/**
 * Something the user authorised in advance, as the rules screen knows it (`GET /permission-rules`
 * and friends).
 *
 * `always` means, in practice, "don't ask me again" — which is why every field that says how far
 * it reaches is here, and why none of them is optional.
 *
 * Narrower than the contract's `PermissionRule` on two fields: `scope` is only ever `project` or
 * `always` here — the one reachable from these routes, `session` living in memory only and never
 * persisted or listed (plan 28, B-48) — and `toolName` is left out entirely: kept by the server for
 * the published app, but this screen names a rule by its `kind`, never by the engine's own word.
 */
export type PermissionRule = Omit<ContractPermissionRule, 'scope' | 'toolName'> & {
  readonly scope: PersistedScope;
};

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
