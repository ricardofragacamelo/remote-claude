import type { UserId } from '@domain/auth';
import { TranscriptNotFoundError } from '@domain/transcript';
import type { ConversationRef } from '@domain/engine';
import type { TranscriptStore } from './ports/transcript-store.port';
import type { ListedTranscript, TranscriptAudience } from './transcript-audience';

/**
 * The conversation, when it exists and this caller may read it — the same answer otherwise.
 *
 * Existence is asked of `getSessionInfo`: the messages come back empty both for an empty conversation
 * and for an id that names nothing, and only the metadata tells them apart (S-03, S-56). Then the fence
 * of the listing: a conversation that would not be **listed** for this caller is not read, followed or
 * opened by them either, and the answer is the one an absent id gets (S-04). Every read of plan 22 goes
 * through here, so the routes and the follower cannot fence differently.
 *
 * @param workspaceHint the folder the caller already believes the conversation runs in — tried
 *   before the allowlist's own roots when the engine cannot say by id alone (S-163); `null` when the
 *   caller does not know
 * @throws {TranscriptNotFoundError} no such transcript, or not one this caller may read
 */
export async function readableTranscript(
  store: TranscriptStore,
  audience: TranscriptAudience,
  sessionId: ConversationRef,
  userId: UserId,
  workspaceHint: string | null = null,
): Promise<ListedTranscript> {
  const found = await store.find(sessionId);
  const session =
    found === null ? null : await audience.resolved(store, found, userId, workspaceHint);
  const [shown] = session === null ? [] : await audience.shown([session], userId);

  if (shown === undefined) {
    throw new TranscriptNotFoundError(sessionId.id);
  }

  return shown;
}
