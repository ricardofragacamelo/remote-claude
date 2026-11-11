import type { PermissionDecision, PersistedScope } from '../types/permission';
import { NEW_RULE_KINDS } from './rule-kind-fields';
import type { NewRuleKind } from './rule-kind-fields';
import { oneOf, text } from './search-params';

/**
 * The wizard's own draft, carried in `/rules/new`'s own search (D-19) — so the link survives a
 * sign-in, and "criar regra a partir desta invocação"/Recriar can hand off without a store.
 *
 * Every field also accepts `undefined` explicitly (`exactOptionalPropertyTypes`), not just absent:
 * TanStack Router merges a route's own `validateSearch` result into its ancestors' by
 * `Object.assign` (never clearing a key an ancestor already carries raw), so the only way
 * `readNewRuleSearch` actually discards an invalid value, rather than leaving the unvalidated one
 * from the URL sitting underneath, is to assign every field `undefined` outright (S-192).
 */
export interface NewRuleSearch {
  readonly kind?: NewRuleKind | undefined;
  readonly pattern?: string | undefined;
  readonly decision?: PermissionDecision | undefined;
  readonly scope?: PersistedScope | undefined;
  readonly folder?: string | undefined;

  /** A catalog template to open the review step from (B-30) — read, but acted on only once that
   * task's own hand-off exists. */
  readonly template?: string | undefined;
}

const DECISIONS: readonly PermissionDecision[] = ['allow', 'deny'];
const SCOPES: readonly PersistedScope[] = ['project', 'always'];

/** The draft, read from whatever the URL carries — field by field, invalid discarded, never
 * thrown (S-192): a malformed hand-off opens a blank wizard, not a broken screen. */
export function readNewRuleSearch(search: Record<string, unknown>): NewRuleSearch {
  return {
    kind: oneOf(search['kind'], NEW_RULE_KINDS),
    pattern: text(search['pattern']),
    decision: oneOf(search['decision'], DECISIONS),
    scope: oneOf(search['scope'], SCOPES),
    folder: text(search['folder']),
    template: text(search['template']),
  };
}
