import type { PermissionDecision, PersistedScope } from '../types/permission';
import type { RuleFilters, RuleListQuery, RuleOrder, RuleSort, RuleStatus } from '../types/rule';
import { oneOf, text } from './search-params';

/** The tab a rule falls into — a status for the server, or a client-side narrowing of `active`. */
export type RuleTab = 'active' | 'expiringSoon' | 'expired' | 'revoked' | 'all';

const RULE_TABS: readonly RuleTab[] = ['active', 'expiringSoon', 'expired', 'revoked', 'all'];
const DECISIONS: readonly PermissionDecision[] = ['allow', 'deny'];
const SCOPES: readonly PersistedScope[] = ['project', 'always'];
const SORTS: readonly RuleSort[] = ['grantedAt', 'expiresAt', 'lastUsedAt', 'useCount', 'pattern'];
const ORDERS: readonly RuleOrder[] = ['asc', 'desc'];

/**
 * Everything the rules screen reads from the URL's search, with every field defaulted (S-156).
 *
 * Every optional field also accepts `undefined` explicitly (`exactOptionalPropertyTypes`), not
 * just absent: TanStack Router merges a route's own `validateSearch` result into its ancestors' by
 * `Object.assign` (never clearing a key an ancestor already carries raw, since `frameRoute` has no
 * `validateSearch` of its own), so the only way `readRulesSearch` actually discards an invalid
 * value, rather than leaving the unvalidated one from the URL sitting underneath, is to assign
 * every field `undefined` outright — the same fix `readNewRuleSearch` needed (S-192).
 */
export interface RulesSearch {
  readonly tab: RuleTab;
  readonly decision?: PermissionDecision | undefined;
  readonly scope?: PersistedScope | undefined;
  readonly kind?: string | undefined;
  readonly folder?: string | undefined;
  readonly q?: string | undefined;
  /** "Com alerta" — only rules with at least one finding. Narrowed on the client (D-13's own limit: findings are computed per page, not over the whole set). */
  readonly withAlert?: boolean | undefined;
  readonly sort: RuleSort;
  readonly order: RuleOrder;
}

export const DEFAULT_RULES_SEARCH: RulesSearch = {
  tab: 'active',
  sort: 'grantedAt',
  order: 'desc',
};

/**
 * The search, read from whatever the URL carries — and only what is well formed.
 *
 * A link can say anything; what it says wrongly falls back to its own default, field by field,
 * rather than failing the whole search — a hand-edited URL shows the closest valid screen, never an
 * error the person did not cause by clicking (the same rule `readAuditSearch` already follows).
 */
export function readRulesSearch(search: Readonly<Record<string, unknown>>): RulesSearch {
  return {
    tab: oneOf(search['tab'], RULE_TABS) ?? DEFAULT_RULES_SEARCH.tab,
    decision: oneOf(search['decision'], DECISIONS),
    scope: oneOf(search['scope'], SCOPES),
    kind: text(search['kind']),
    folder: text(search['folder']),
    q: text(search['q']),
    withAlert: search['withAlert'] === true ? true : undefined,
    sort: oneOf(search['sort'], SORTS) ?? DEFAULT_RULES_SEARCH.sort,
    order: oneOf(search['order'], ORDERS) ?? DEFAULT_RULES_SEARCH.order,
  };
}

/** The server status (or statuses) a tab reads — `expiringSoon` narrows `active` further, on the client (plan 03, D-13). */
function statusesOf(tab: RuleTab): readonly RuleStatus[] {
  switch (tab) {
    case 'active':
    case 'expiringSoon':
      return ['active'];
    case 'expired':
      return ['expired'];
    case 'revoked':
      return ['revoked'];
    case 'all':
      return ['active', 'expired', 'revoked'];
  }
}

/** `decision`/`scope`/`kind`/`folder`/`q` — the five fields the listing and the summary read alike,
 * neither ever touching `status` or `withAlert` (each reads those its own way). */
function sharedFilterFields(
  search: RulesSearch,
): Pick<RuleFilters, 'decision' | 'scope' | 'kind' | 'folder' | 'q'> {
  return {
    ...(search.decision === undefined ? {} : { decision: search.decision }),
    ...(search.scope === undefined ? {} : { scope: search.scope }),
    ...(search.kind === undefined ? {} : { kind: search.kind }),
    ...(search.folder === undefined ? {} : { folder: search.folder }),
    ...(search.q === undefined ? {} : { q: search.q }),
  };
}

/** The search, as the query the listing and the summary actually send — `withAlert` stays on the client, since no route filters by it. */
export function rulesListQuery(search: RulesSearch): RuleListQuery {
  return {
    ...sharedFilterFields(search),
    sort: search.sort,
    order: search.order,
    status: statusesOf(search.tab),
  };
}

/**
 * The search, as the summary reads it — the same filters, but never a `status`: `/summary` counts
 * over the listing's own default predicate (active + expired), not a chosen one (D-13's own
 * reading). `expiresBefore` is the tabs' own window, not the search's — the "Perto de expirar" tab's
 * count is `expiringBefore` under that window, never a filter somebody typed.
 */
export function ruleSummaryFilters(search: RulesSearch, expiresBefore: string): RuleFilters {
  return { ...sharedFilterFields(search), expiresBefore };
}
