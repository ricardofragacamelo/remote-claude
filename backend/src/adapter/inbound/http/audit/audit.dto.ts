import { z } from 'zod';

import { AUDIT_DECISIONS, disclosedInput } from '@domain/audit';
import type { AuditTrailPage, AuditTrailRecord } from '@application/audit';

/** How many entries a page holds when the client does not say, and the most it may ask for. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

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
    decision: z.enum(AUDIT_DECISIONS).optional(),
    /** Inclusive. */
    from: z.iso.datetime({ offset: true }).optional(),
    /** Exclusive. */
    to: z.iso.datetime({ offset: true }).optional(),
    cursor: z
      .string()
      .regex(/^[1-9]\d{0,14}$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
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

/** What was decided, as the client sees it. */
export interface AuditVerdictDto {
  readonly requestId: string;
  readonly auto: boolean;
  readonly ruleId: string | null;
  readonly scope: string;
  readonly resolvedBy: string | null;
  readonly resolvedFrom: string | null;
}

/**
 * One entry of the trail, as the client sees it.
 *
 * The owner is not here: it is always the caller, since nobody reads another person's trail.
 */
export interface AuditEntryDto {
  readonly id: string;
  readonly sessionId: string;
  readonly toolUseId: string | null;
  readonly toolName: string;

  /** Exactly as the tool was called — except a `Read`, which never hands back a file's contents. */
  readonly input: Readonly<Record<string, unknown>>;

  readonly decision: string;
  readonly at: string;

  /** What leads from the entry to the log and the events of the same turn. */
  readonly traceId: string | null;

  /** `null` on a `recorded` entry, and on a decision written before the trail kept one. */
  readonly verdict: AuditVerdictDto | null;
}

/** A page. An object and not a bare array, so the next cursor has somewhere to go. */
export interface AuditTrailPageDto {
  readonly entries: readonly AuditEntryDto[];

  /** Opaque to the client: send it back as `cursor` for the next page. `null` on the last one. */
  readonly nextCursor: string | null;
}

/** The transport shape of one entry. */
export function toAuditEntryDto({ entry, traceId }: AuditTrailRecord): AuditEntryDto {
  const verdict = entry.verdict;

  return {
    id: entry.id,
    sessionId: entry.sessionId.value,
    toolUseId: entry.toolUseId,
    toolName: entry.toolName,
    input: disclosedInput(entry.toolName, entry.input.value),
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
export function toAuditTrailPageDto(page: AuditTrailPage): AuditTrailPageDto {
  return {
    entries: page.records.map(toAuditEntryDto),
    nextCursor: page.nextCursor === null ? null : String(page.nextCursor),
  };
}
