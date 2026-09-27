/**
 * The history as the backend answers it, for the specs of the screens and services that read it.
 *
 * One place, because three specs describe the same two payloads and a copy per spec is how two of
 * them come to disagree about an optional field.
 */

/** A conversation begun here, and one begun in the editor. */
export const OURS = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
export const EDITOR = '0f0e0d0c-0b0a-4908-8706-050403020100';

export const WORKSPACE = '/srv/projects/app';
export const WRITTEN = '2026-09-25T12:00:00.000Z';

/** One conversation, as `GET /transcripts` and a page of messages both describe it. */
export function aConversationDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: OURS,
    summary: 'Fix the flaky test',
    origin: 'ours',
    cwd: WORKSPACE,
    gitBranch: null,
    createdAt: null,
    lastModified: WRITTEN,
    ...overrides,
  };
}

/** A message the model finished, in the shape of the live `message.completed`. */
export function said(
  messageId: string,
  text: string,
  role: 'assistant' | 'user' = 'assistant',
): { type: string; payload: Record<string, unknown> } {
  return {
    type: 'message.completed',
    payload: { messageId, role, content: [{ type: 'text', text }] },
  };
}

/** A page of messages, oldest first, with the cursor of the page before it. */
export function aHistoryPage(
  events: readonly { type: string; payload: Record<string, unknown> }[],
  overrides: { session?: Record<string, unknown>; nextCursor?: string | null } = {},
): Record<string, unknown> {
  return {
    session: overrides.session ?? aConversationDto(),
    events,
    nextCursor: overrides.nextCursor ?? null,
  };
}

/** The failure the SDK being down produces, as the error envelope carries it. */
export const claudeUnavailable = {
  code: 'CLAUDE_UNAVAILABLE',
  messageKey: 'transcript.error.claudeUnavailable',
  params: {},
  traceId: 'trace-sdk',
};
