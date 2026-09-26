import { api } from '@/shared/api/api';
import type { AuditFilters, AuditPage } from '../types/audit';

/** The filters in the order the query string carries them, so the same filter is the same URL. */
const FILTER_FIELDS = ['sessionId', 'toolName', 'decision', 'from', 'to'] as const;

/**
 * One page of the caller's trail, newest first.
 *
 * The cursor is the server's and opaque here: it goes back exactly as it came. Paging is by cursor
 * and never by offset — the trail grows while somebody reads it, and an offset would repeat and
 * skip entries.
 *
 * @throws {import('@/shared/api/errors').AppError} `FORBIDDEN` for somebody else's session,
 *   `INVALID_INPUT` for a filter the server cannot run
 */
export async function fetchAuditPage(
  filters: AuditFilters,
  cursor: string | null,
): Promise<AuditPage> {
  const query = new URLSearchParams();

  for (const field of FILTER_FIELDS) {
    const value = filters[field];
    if (value !== undefined && value !== '') {
      query.set(field, value);
    }
  }

  if (cursor !== null) {
    query.set('cursor', cursor);
  }

  const search = query.toString();

  return api.get<AuditPage>(search === '' ? '/audit-entries' : `/audit-entries?${search}`);
}
