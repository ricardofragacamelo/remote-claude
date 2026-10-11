import { z } from 'zod';
import type {
  ListedTranscript as ListedTranscriptPayload,
  SubagentPagePayload,
  TranscriptListPayload,
  TranscriptPagePayload,
  TranscriptToolResultPayload,
} from '@remote-claude/contracts';

import type { ListedTranscript, TranscriptPage } from '@application/transcript';
import type {
  Page,
  SessionListCursor,
  ToolOutput,
  TranscriptMessage,
  VisibleTranscriptSession,
} from '@domain/transcript';
import { previousToolFields } from '@shared/protocol/previous-tool-fields';

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

/**
 * An id an engine handed out — of a conversation, or of a message: opaque here, plain and short.
 * Whether it is one the engine would hand out is the engine's own rule, asked by the registry.
 */
const OPAQUE_ID = /^\S{1,256}$/;

/** How an engine is named — the form of an `id` of `GET /engines`. */
const ENGINE = /^[a-z][a-z0-9-]{0,31}$/;

/** `<lastModified>.<engine>:<id>`: digits without a leading zero, a dot, the conversation. */
const SESSION_CURSOR = /^(0|[1-9]\d{0,15})\.([a-z][a-z0-9-]{0,31}:\S{1,256})$/;

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
  // A query string has no booleans: the two words, and nothing else, so `?includeSubfolders=yes`
  // is a 400 rather than a guess (plan 08, D-05).
  includeSubfolders: z.enum(['true', 'false']).optional(),
});

export type ListTranscriptsQueryDto = z.infer<typeof listTranscriptsSchema>;

/** The conversation a page is asked of, in its engine's own form. */
export const transcriptIdSchema = z.string().regex(OPAQUE_ID);

/** The engine of the conversation a page is asked of. */
export const engineSchema = z.string().regex(ENGINE);

/**
 * The tool a subagent hangs off — an id the SDK minted (`toolu_…`), short and plain. Anything else is
 * not one this server can name.
 */
export const subagentToolSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/** The tool of a route of the previous protocol (plan 28, D-08): its conversation, and the tool. */
export const previousToolSchema = z.object({
  sessionId: transcriptIdSchema,
  toolUseId: subagentToolSchema,
});

export type PreviousToolParams = z.infer<typeof previousToolSchema>;

/** What `GET /transcripts/:engine/:id/messages` may be asked. The cursor is a message id. */
export const readTranscriptSchema = z.object({
  cursor: z.string().regex(OPAQUE_ID).optional(),
  limit,
});

export type ReadTranscriptQueryDto = z.infer<typeof readTranscriptSchema>;

/** The cursor a listing handed out, as the use case takes it back. */
export function toSessionListCursor(cursor: string | undefined): SessionListCursor | null {
  const match = cursor === undefined ? null : SESSION_CURSOR.exec(cursor);

  return match === null ? null : { lastModified: Number(match[1]), id: String(match[2]) };
}

/** One conversation, as the client sees it. */
export type TranscriptSessionDto = Omit<
  ListedTranscriptPayload,
  'activity' | 'liveSessionId' | 'writtenAgoSeconds'
>;

/** A conversation of the listing: the conversation, and what it is doing now (plan 08, B-08). */
export type ListedTranscriptDto = ListedTranscriptPayload;

/** A page of the listing. An object, so the next cursor has somewhere to go. */
export type TranscriptListDto = TranscriptListPayload;

/**
 * A page of a conversation.
 *
 * `events` are frames of the live contract without their envelope — `{ type, payload }`, exactly
 * as `message.completed`, `tool.started` and `tool.completed` arrive on the socket — so a client
 * feeds history and the live stream through one reducer (B-03). Oldest first within the page; the
 * page after it, by `nextCursor`, is what came before.
 */
export type TranscriptPageDto = TranscriptPagePayload;

/** The transport shape of a conversation. */
export function toTranscriptSessionDto(session: VisibleTranscriptSession): TranscriptSessionDto {
  return {
    conversation: { engine: session.id.engine.value, id: session.id.id },
    sessionId: session.id.id,
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
/** A conversation of the listing or of a page, with what it is doing now. */
function toListedTranscriptDto(session: ListedTranscript): ListedTranscriptDto {
  return {
    ...toTranscriptSessionDto(session),
    activity: session.activity.activity,
    liveSessionId: session.activity.liveSessionId,
    writtenAgoSeconds: session.activity.writtenAgoSeconds,
  };
}

export function toTranscriptListDto(
  page: Page<ListedTranscript, SessionListCursor>,
): TranscriptListDto {
  return {
    sessions: page.items.map(toListedTranscriptDto),
    nextCursor: page.next === null ? null : `${String(page.next.lastModified)}.${page.next.id}`,
  };
}

/** The transport shape of a page of a conversation. */
export function toTranscriptPageDto({
  session,
  page,
  lastMessageId,
}: TranscriptPage): TranscriptPageDto {
  return {
    session: toListedTranscriptDto(session),
    events: eventsOf(page.items),
    nextCursor: page.next,
    lastMessageId,
  };
}

/**
 * The block of an image, as its marker names it: `<uuid>:<index>` — the conversation's entry, and the
 * block's place in it (plan 22, D-06). Anything else names no block this server minted.
 */
export const blockIdSchema = z.string().regex(/^[^\s:]{1,256}:\d{1,4}$/);

/** The image of a route of the previous protocol (plan 28, D-08): its conversation, and the block. */
export const previousImageSchema = z.object({
  sessionId: transcriptIdSchema,
  blockId: blockIdSchema,
});

export type PreviousImageParams = z.infer<typeof previousImageSchema>;

/** The whole output of a tool, as `GET /transcripts/:sessionId/tools/:toolUseId/result` answers it. */
export type ToolResultDto = TranscriptToolResultPayload;

/** The transport shape of a tool's output — `cutAt` only when it was cut. */
export function toToolResultDto(output: ToolOutput): ToolResultDto {
  return {
    text: output.text,
    truncated: output.truncated,
    bytes: output.bytes,
    ...(output.cutAt === undefined ? {} : { cutAt: output.cutAt }),
  };
}

/** A page of what a subagent said: the events of its messages, and the cursor of the page before. */
export type SubagentPageDto = SubagentPagePayload;

/** The transport shape of a page of a subagent. */
export function toSubagentPageDto(page: Page<TranscriptMessage, string>): SubagentPageDto {
  return { events: eventsOf(page.items), nextCursor: page.next };
}

/**
 * The events of [messages], each `tool.started` with the fields the previous protocol named the call
 * by beside the canonical ones: a page over HTTP has no version to answer in, and an app on a store
 * reads it (plan 28, D-22). Gone with the window, in F7 (B-47).
 */
function eventsOf(messages: readonly TranscriptMessage[]): TranscriptMessage['events'] {
  return messages.flatMap((message) =>
    message.events.map((event) =>
      event.type === 'tool.started'
        ? { ...event, payload: { ...event.payload, ...previousToolFields(event.payload) } }
        : event,
    ),
  );
}
