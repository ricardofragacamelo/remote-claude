import { api } from '@/shared/api/api';
import { isRecord, readText } from '@/shared/lib/json';
import type {
  ConversationOrigin,
  ConversationSummary,
  HistoryEvent,
  HistoryPage,
} from '../types/history';

/** The shape the backend answers with. It stops existing at the end of this file. */
interface HistoryPageResponse {
  readonly session?: unknown;
  readonly events?: unknown;
  readonly nextCursor?: unknown;
}

/**
 * One page of a conversation, from the latest message backwards.
 *
 * The cursor is the server's and opaque here: it goes back exactly as it came. A page is counted in
 * messages and handed over as events, and an event this build cannot read is dropped rather than
 * thrown over — one malformed entry should cost the person that entry, not the page.
 *
 * @param cursor the `nextCursor` of the page after this one, or `null` for the latest messages
 * @throws {import('@/shared/api/errors').AppError} `NOT_FOUND` for a conversation that does not
 *   exist or is not the caller's, `CLAUDE_UNAVAILABLE` / `CLAUDE_TIMEOUT` when the SDK failed
 */
export async function fetchHistoryPage(
  conversationId: string,
  cursor: string | null,
): Promise<HistoryPage> {
  const path = `/transcripts/${encodeURIComponent(conversationId)}/messages`;
  const body = await api.get<HistoryPageResponse>(
    cursor === null ? path : `${path}?cursor=${encodeURIComponent(cursor)}`,
  );

  const conversation = toConversationSummary(body.session);

  if (conversation === null) {
    throw new TypeError('the history answered without the conversation it is a page of');
  }

  return {
    conversation,
    events: Array.isArray(body.events) ? body.events.flatMap(toHistoryEvent) : [],
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
  };
}

/**
 * One conversation as the backend describes it, or `null` when the entry is not one.
 *
 * Shared by the listing and by a page, because both carry the same description of a conversation —
 * and two readers of one shape are two chances to disagree about an optional field.
 */
export function toConversationSummary(value: unknown): ConversationSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const conversationId = readText(value, 'sessionId');
  const cwd = readText(value, 'cwd');
  const lastModified = readText(value, 'lastModified');
  const origin = value['origin'];

  if (conversationId === null || cwd === null || lastModified === null || !isOrigin(origin)) {
    return null;
  }

  return {
    conversationId,
    summary: readText(value, 'summary') ?? '',
    origin,
    cwd,
    gitBranch: readText(value, 'gitBranch'),
    lastModified,
  };
}

function isOrigin(value: unknown): value is ConversationOrigin {
  return value === 'ours' || value === 'external';
}

function toHistoryEvent(value: unknown): HistoryEvent[] {
  if (!isRecord(value) || typeof value['type'] !== 'string' || !isRecord(value['payload'])) {
    return [];
  }

  return [{ type: value['type'], payload: value['payload'] }];
}
