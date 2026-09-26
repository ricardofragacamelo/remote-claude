import type { TranscriptStore } from '@application/transcript';
import type { ClaudeSessionId, TranscriptMessage, TranscriptSession } from '@domain/transcript';

/**
 * Claude's store, as the port sees it: sessions filed by directory, and their messages.
 *
 * What it answers about `[]` is what the SDK answers — an empty conversation and an absent one both
 * have no messages — so a use case that forgot to ask `find` first would be caught here too.
 */
export class InMemoryTranscriptStore implements TranscriptStore {
  private readonly byDirectory = new Map<string, TranscriptSession[]>();
  private readonly messagesById = new Map<string, readonly TranscriptMessage[]>();

  /** Every directory `list` was asked about, in order. */
  readonly listed: string[] = [];

  /** How many times the messages were read. */
  reads = 0;

  add(
    directory: string,
    session: TranscriptSession,
    messages: readonly TranscriptMessage[] = [],
  ): this {
    this.byDirectory.set(directory, [...(this.byDirectory.get(directory) ?? []), session]);
    this.messagesById.set(session.id.value, messages);
    return this;
  }

  list(directory: string): Promise<readonly TranscriptSession[]> {
    this.listed.push(directory);
    return Promise.resolve(this.byDirectory.get(directory) ?? []);
  }

  find(id: ClaudeSessionId): Promise<TranscriptSession | null> {
    const session = [...this.byDirectory.values()].flat().find((each) => each.id.equals(id));
    return Promise.resolve(session ?? null);
  }

  messages(session: TranscriptSession): Promise<readonly TranscriptMessage[]> {
    this.reads += 1;
    return Promise.resolve(this.messagesById.get(session.id.value) ?? []);
  }
}
