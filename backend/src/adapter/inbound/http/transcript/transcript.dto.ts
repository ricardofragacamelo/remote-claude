import { z } from 'zod';

import type { TranscriptPage } from '@application/transcript';
import type {
  Page,
  SessionListCursor,
  TranscriptEvent,
  VisibleTranscriptSession,
} from '@domain/transcript';

/**
 * How many items a page holds when the client does not say, and the most it may ask for.
 *
 * Twenty-five messages at ~16.5 KB each — measured, because the payload carries tool input and
 * output — is ~400 KB, which is what can be handed to a phone
 * ([D-02](../../../../../docs/plans/04-transcript-and-resume/decisions.md)). The listing uses the
 * same numbers: one workspace held 154 sessions when the store was measured.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** A UUID in the canonical form the SDK hands out — the id of a conversation, and of a message. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `<lastModified>.<sessionId>`: digits without a leading zero, a dot, a UUID. */
const SESSION_CURSOR =
  /^(0|[1-9]\d{0,15})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

const limit = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional();

/**
 * What `GET /transcripts` may be asked.
 *
 * Format only, as everywhere at this edge; whether the path may be reached is the allowlist's
 * question, answered in the use case. The path travels as a query parameter, like
 * `GET /workspaces/resolve`: a proxy that normalises `%2F` in a URL segment would change the value
 * the allowlist is about to check.
 */
export const listTranscriptsSchema = z.object({
  workspacePath: z.string().min(1).max(4096),
  cursor: z.string().regex(SESSION_CURSOR).optional(),
  limit,
});

export type ListTranscriptsQueryDto = z.infer<typeof listTranscriptsSchema>;

/** The conversation a page is asked of: a UUID, or not a conversation this server can name. */
export const transcriptIdSchema = z.string().regex(UUID);

/** What `GET /transcripts/:sessionId/messages` may be asked. The cursor is a message id. */
export const readTranscriptSchema = z.object({
  cursor: z.string().regex(UUID).optional(),
  limit,
});

export type ReadTranscriptQueryDto = z.infer<typeof readTranscriptSchema>;

/** The cursor a listing handed out, as the use case takes it back. */
export function toSessionListCursor(cursor: string | undefined): SessionListCursor | null {
  const match = cursor === undefined ? null : SESSION_CURSOR.exec(cursor);

  return match === null ? null : { lastModified: Number(match[1]), id: String(match[2]) };
}

/** One conversation, as the client sees it. */
export interface TranscriptSessionDto {
  /** The id of the conversation in Claude's store — what `session.start` takes as `resumeSessionId`. */
  readonly sessionId: string;
  readonly summary: string;

  /** `ours` — opened here, by the caller — or `external`: the editor, or the terminal. */
  readonly origin: string;

  readonly cwd: string;
  readonly gitBranch: string | null;
  readonly createdAt: string | null;
  readonly lastModified: string;
}

/** A page of the listing. An object, so the next cursor has somewhere to go. */
export interface TranscriptListDto {
  readonly sessions: readonly TranscriptSessionDto[];

  /** Opaque to the client: send it back as `cursor` for the next page. `null` on the last one. */
  readonly nextCursor: string | null;
}

/**
 * A page of a conversation.
 *
 * `events` are frames of the live contract without their envelope — `{ type, payload }`, exactly
 * as `message.completed`, `tool.started` and `tool.completed` arrive on the socket — so a client
 * feeds history and the live stream through one reducer (B-03). Oldest first within the page; the
 * page after it, by `nextCursor`, is what came before.
 */
export interface TranscriptPageDto {
  readonly session: TranscriptSessionDto;
  readonly events: readonly TranscriptEvent[];
  readonly nextCursor: string | null;
}

/** The transport shape of a conversation. */
export function toTranscriptSessionDto(session: VisibleTranscriptSession): TranscriptSessionDto {
  return {
    sessionId: session.id.value,
    summary: session.summary,
    origin: session.origin,
    // Never `null` here: a session without one is not visible, and so never reaches a DTO.
    cwd: session.cwd ?? '',
    gitBranch: session.gitBranch,
    createdAt: session.createdAt?.toISOString() ?? null,
    lastModified: new Date(session.lastModified).toISOString(),
  };
}

/** The transport shape of a page of the listing. */
export function toTranscriptListDto(
  page: Page<VisibleTranscriptSession, SessionListCursor>,
): TranscriptListDto {
  return {
    sessions: page.items.map(toTranscriptSessionDto),
    nextCursor: page.next === null ? null : `${String(page.next.lastModified)}.${page.next.id}`,
  };
}

/** The transport shape of a page of a conversation. */
export function toTranscriptPageDto({ session, page }: TranscriptPage): TranscriptPageDto {
  return {
    session: toTranscriptSessionDto(session),
    events: page.items.flatMap((message) => message.events),
    nextCursor: page.next,
  };
}
