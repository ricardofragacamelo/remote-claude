import { z } from 'zod';

import type { AuditEventPagePayload } from '@remote-claude/contracts';

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

function toAuditEventDto({ event }: AuditEventRecord): AuditEventPagePayload['events'][number] {
  return {
    id: event.id,
    kind: event.kind,
    subjectId: event.subjectId,
    subjectLabel: event.subjectLabel,
    details: event.details,
    at: event.at.toISOString(),
  };
}

export function toAuditEventPageDto(page: AuditEventPage): AuditEventPagePayload {
  return {
    events: page.records.map(toAuditEventDto),
    nextCursor: page.nextCursor === null ? null : String(page.nextCursor),
  };
}
