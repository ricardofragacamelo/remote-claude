import type { TranscriptPagePayload } from '@remote-claude/contracts';

import { api } from '@/shared/api/api';
import { readConversation } from '@/shared/lib/conversation';
import type { ConversationRef } from '@/shared/lib/conversation';
import { isRecord, readText } from '@/shared/lib/json';
import type { Unchecked } from '@/shared/lib/json';
import type {
  ConversationActivity,
  ConversationOrigin,
  ConversationSummary,
  HistoryEvent,
  HistoryPage,
} from '../types/history';

/**
 * The path of a conversation on the server: `/transcripts/:engine/:id`, then `rest` — every part
 * escaped. Shared by every route of a conversation, so none of them forgets the engine.
 */
export function transcriptPath(conversation: ConversationRef, ...rest: readonly string[]): string {
  return [
    '/transcripts',
    ...[conversation.engine, conversation.id, ...rest].map(encodeURIComponent),
  ].join('/');
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
 *   exist or is not the caller's, `AGENT_UNAVAILABLE` / `AGENT_TIMEOUT` when the engine failed
 */
export async function fetchHistoryPage(
  conversation: ConversationRef,
  cursor: string | null,
): Promise<HistoryPage> {
  const path = transcriptPath(conversation, 'messages');
  const body = await api.get<Unchecked<TranscriptPagePayload>>(
    cursor === null ? path : `${path}?cursor=${encodeURIComponent(cursor)}`,
  );

  const summary = toConversationSummary(body.session);

  if (summary === null) {
    throw new TypeError('the history answered without the conversation it is a page of');
  }

  return {
    conversation: summary,
    events: toHistoryEvents(body.events),
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
    lastMessageId: typeof body.lastMessageId === 'string' ? body.lastMessageId : null,
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

  const conversation = readConversation(value, 'conversation');
  const cwd = readText(value, 'cwd');
  const lastModified = readText(value, 'lastModified');
  const origin = value['origin'];

  if (conversation === null || cwd === null || lastModified === null || !isOrigin(origin)) {
    return null;
  }

  return {
    conversation,
    summary: readText(value, 'summary') ?? '',
    origin,
    cwd,
    gitBranch: readText(value, 'gitBranch'),
    lastModified,
    ...activityOf(value),
  };
}

function isOrigin(value: unknown): value is ConversationOrigin {
  return value === 'ours' || value === 'external';
}

const ACTIVITIES: ReadonlySet<string> = new Set(['liveHere', 'activeElsewhere', 'idle']);

/**
 * What a conversation is doing, as the backend said it — `idle` when it said nothing this build
 * reads, which promises nothing: a conversation the screen does not know is live is shown as history.
 */
function activityOf(
  value: Readonly<Record<string, unknown>>,
): Pick<ConversationSummary, 'activity' | 'liveSessionId' | 'writtenAgoSeconds'> {
  const activity = readText(value, 'activity');
  const writtenAgo = value['writtenAgoSeconds'];

  return {
    activity:
      activity !== null && ACTIVITIES.has(activity) ? (activity as ConversationActivity) : 'idle',
    liveSessionId: readText(value, 'liveSessionId'),
    writtenAgoSeconds: typeof writtenAgo === 'number' ? writtenAgo : null,
  };
}

/** The events of a page, as far as they can be read: one this build cannot read is dropped. */
export function toHistoryEvents(value: unknown): HistoryEvent[] {
  return Array.isArray(value) ? value.flatMap(toHistoryEvent) : [];
}

function toHistoryEvent(value: unknown): HistoryEvent[] {
  if (!isRecord(value) || typeof value['type'] !== 'string' || !isRecord(value['payload'])) {
    return [];
  }

  return [{ type: value['type'], payload: value['payload'] }];
}
