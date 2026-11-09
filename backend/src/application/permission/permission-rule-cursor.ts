import type {
  PermissionRuleCursor,
  PermissionRuleSortField,
  PermissionRuleSortOrder,
} from './ports/permission-rule.repository';
import { PERMISSION_RULE_SORT_FIELDS } from './ports/permission-rule.repository';

/**
 * The listing's cursor, opaque to the client — base64url of a small JSON object naming the sort
 * key's own value at the boundary row, plus `(grantedAt, id)` as the tiebreak
 * ([15 · D-13](../../../../docs/plans/15-rules-management/decisions.md#d-13--a-listagem-pagina)).
 *
 * A pure codec in `application/`, not in the repository that emits it nor in the controller that
 * reads it back: both need it, and a copy in each is the one that reads a cursor the other wrote
 * differently.
 */
export function encodeRuleCursor(cursor: PermissionRuleCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** `null` for anything that does not decode to a well-formed cursor — never thrown. */
export function decodeRuleCursor(raw: string): PermissionRuleCursor | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const candidate = parsed as Partial<PermissionRuleCursor>;

  return isWellFormed(candidate)
    ? {
        sort: candidate.sort,
        order: candidate.order,
        value: candidate.value,
        grantedAt: candidate.grantedAt,
        id: candidate.id,
      }
    : null;
}

function isWellFormed(candidate: Partial<PermissionRuleCursor>): candidate is PermissionRuleCursor {
  return (
    typeof candidate.sort === 'string' &&
    isSortField(candidate.sort) &&
    isSortOrder(candidate.order) &&
    typeof candidate.grantedAt === 'string' &&
    typeof candidate.id === 'string' &&
    isCursorValue(candidate.value)
  );
}

function isSortField(value: string): value is PermissionRuleSortField {
  return (PERMISSION_RULE_SORT_FIELDS as readonly string[]).includes(value);
}

function isSortOrder(value: unknown): value is PermissionRuleSortOrder {
  return value === 'asc' || value === 'desc';
}

function isCursorValue(value: unknown): value is string | number | null {
  return typeof value === 'string' || typeof value === 'number' || value === null;
}
