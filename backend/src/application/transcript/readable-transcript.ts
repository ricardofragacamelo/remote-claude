import type { UserId } from '@domain/auth';
import { TranscriptNotFoundError } from '@domain/transcript';
import type { ClaudeSessionId } from '@domain/transcript';
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
 * @throws {TranscriptNotFoundError} no such transcript, or not one this caller may read
 */
export async function readableTranscript(
  store: TranscriptStore,
  audience: TranscriptAudience,
  sessionId: ClaudeSessionId,
  userId: UserId,
): Promise<ListedTranscript> {
  const session = await store.find(sessionId);
  const [shown] = session === null ? [] : await audience.shown([session], userId);

  if (shown === undefined) {
    throw new TranscriptNotFoundError(sessionId.value);
  }

  return shown;
}
