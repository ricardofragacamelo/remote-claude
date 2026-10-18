import { z } from 'zod';

import type { AuditTrailPagePayload } from '@remote-claude/contracts';

import { AUDIT_DECISIONS } from '@domain/audit';
import type { DisclosedAuditPage, DisclosedAuditRecord } from '@application/audit';

/** How many entries a page holds when the client does not say, and the most it may ask for. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/**
 * Where a page of a trail starts and how long it is — both trails page the same way.
 *
 * The cursor is opaque to the client and is a `seq` here: digits, no sign, no leading zero —
 * anything else is a cursor this server never handed out.
 */
export const pageQuery = {
  cursor: z
    .string()
    .regex(/^[1-9]\d{0,14}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
};

/**
 * What `GET /audit-entries` may be asked. Every filter is optional; the owner never is, and it is
 * not a parameter — it is the caller.
 *
 * Format only, as everywhere at this edge. The cursor is opaque to the client and is a `seq` here:
 * digits, no sign, no leading zero — anything else is a cursor this server never handed out.
 */
export const auditTrailQuerySchema = z
  .object({
    sessionId: z.string().min(1).max(64).optional(),
    toolName: z.string().min(1).max(128).optional(),
    /** The canonical kind of the call — `shell`, `file.edit` (plan 28, B-33). */
    kind: z
      .string()
      .regex(/^[a-z]+(?:\.[a-z]+)*$/)
      .max(64)
      .optional(),
    decision: z.enum(AUDIT_DECISIONS).optional(),
    /** Inclusive. */
    from: z.iso.datetime({ offset: true }).optional(),
    /** Exclusive. */
    to: z.iso.datetime({ offset: true }).optional(),
    ...pageQuery,
  })
  // A window that ends before it starts is a client's mistake, and an empty page would hide it.
  // Compared as instants and not as strings: two offsets make the text order lie.
  .refine(
    (query) =>
      query.from === undefined ||
      query.to === undefined ||
      Date.parse(query.from) <= Date.parse(query.to),
    { path: ['to'], message: 'the period ends before it starts' },
  );

export type AuditTrailQuery = z.infer<typeof auditTrailQuerySchema>;

/** The transport shape of one entry. */
export function toAuditEntryDto({
  entry,
  traceId,
  disclosed,
  kind,
}: DisclosedAuditRecord): AuditTrailPagePayload['entries'][number] {
  const verdict = entry.verdict;

  return {
    id: entry.id,
    sessionId: entry.sessionId.value,
    toolUseId: entry.toolUseId,
    toolName: entry.toolName,
    kind,
    input: disclosed,
    decision: entry.decision,
    at: entry.at.toISOString(),
    traceId,
    verdict:
      verdict === null
        ? null
        : {
            requestId: verdict.requestId,
            auto: verdict.auto,
            ruleId: verdict.ruleId,
            scope: verdict.scope,
            resolvedBy: verdict.resolvedBy?.value ?? null,
            resolvedFrom: verdict.resolvedFrom,
          },
  };
}

/** The transport shape of a page. */
export function toAuditTrailPageDto(page: DisclosedAuditPage): AuditTrailPagePayload {
  return {
    entries: page.records.map(toAuditEntryDto),
    nextCursor: page.nextCursor === null ? null : String(page.nextCursor),
  };
}
