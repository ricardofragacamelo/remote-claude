import type {
  AuditEventPagePayload,
  AuditEventPagePayloadEventsItem,
} from '@remote-claude/contracts';

import { api } from '@/shared/api/api';
import { FILE_ACTS } from '../types/file-facts';
import type { FileAct, FileFact, FileFactPage } from '../types/file-facts';

/** One account fact, as `GET /audit-events` answers it — without the `subjectId`, which this
 * feature never shows: a file fact names its path, `subjectLabel`, and nothing of the real one. */
type AuditEventDto = Pick<
  AuditEventPagePayloadEventsItem,
  'id' | 'kind' | 'subjectLabel' | 'details' | 'at'
>;

type AuditEventPageDto = Pick<AuditEventPagePayload, 'nextCursor'> & {
  readonly events: readonly AuditEventDto[];
};

function actOf(kind: string): FileAct | null {
  const act = kind.slice('file.'.length);
  return (FILE_ACTS as readonly string[]).includes(act) ? (act as FileAct) : null;
}

/** A fact as the screen knows it — sizes and hashes stay behind, and there is never content. */
function toFileFact(event: AuditEventDto): FileFact | null {
  const act = actOf(event.kind);

  if (act === null) {
    return null;
  }

  const to = event.details?.['to'];

  return {
    id: event.id,
    act,
    path: event.subjectLabel,
    to: typeof to === 'string' ? to : null,
    at: event.at,
  };
}

/**
 * One page of the caller's facts about files, newest first — `GET /audit-events?kind=file.`
 * ([07 · D-13](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-13--onde-os-fatos-de-arquivo-aparecem-na-trilha)).
 * The owner is the caller, never a parameter; the cursor goes back exactly as it came.
 */
export async function fetchFileFacts(cursor: string | null): Promise<FileFactPage> {
  const query = new URLSearchParams({ kind: 'file.' });

  if (cursor !== null) {
    query.set('cursor', cursor);
  }

  const page = await api.get<AuditEventPageDto>(`/audit-events?${query.toString()}`);

  return {
    facts: page.events.flatMap((event) => toFileFact(event) ?? []),
    nextCursor: page.nextCursor,
  };
}
