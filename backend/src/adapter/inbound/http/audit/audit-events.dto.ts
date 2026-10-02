import { z } from 'zod';

import type { AuditEventPage, AuditEventRecord } from '@application/audit';
import { pageQuery } from './audit.dto';

/**
 * What `GET /audit-events` may be asked. The owner is not a parameter — it is the caller.
 *
 * `kind` is a prefix: `file.` is every fact about the person's files, `file.written` only the saves.
 * Letters and dots, nothing else, so it can never smuggle a wildcard of its own into the query. The
 * cursor is opaque to the client and a `seq` here: digits, no sign, no leading zero.
 */
export const auditEventsQuerySchema = z.object({
  kind: z
    .string()
    .regex(/^[a-zA-Z]+(\.[a-zA-Z]*)?$/)
    .optional(),
  ...pageQuery,
});

export type AuditEventsQuery = z.infer<typeof auditEventsQuerySchema>;

/** One fact, as the client sees it. The owner is the caller, so it is not here. */
export interface AuditEventDto {
  readonly id: string;
  readonly kind: string;
  /** What the fact is about — for a file, its real path. */
  readonly subjectId: string;
  /** How to show the subject — for a file, its path relative to the open folder. */
  readonly subjectLabel: string;
  /** Sizes, hashes, origin and destination, counts — never the contents of a file. */
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly at: string;
}

export interface AuditEventPageDto {
  readonly events: readonly AuditEventDto[];
  /** Opaque to the client: send it back as `cursor`. `null` on the last page. */
  readonly nextCursor: string | null;
}

function toAuditEventDto({ event }: AuditEventRecord): AuditEventDto {
  return {
    id: event.id,
    kind: event.kind,
    subjectId: event.subjectId,
    subjectLabel: event.subjectLabel,
    details: event.details,
    at: event.at.toISOString(),
  };
}

export function toAuditEventPageDto(page: AuditEventPage): AuditEventPageDto {
  return {
    events: page.records.map(toAuditEventDto),
    nextCursor: page.nextCursor === null ? null : String(page.nextCursor),
  };
}
