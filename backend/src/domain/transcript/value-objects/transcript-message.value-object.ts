/**
 * One event of our contract, rebuilt from history.
 *
 * The **same** shape as a live event — `message.completed`, `tool.started`, `tool.completed` with
 * the payloads the generated contract declares. Two formats for the same thing would mean two
 * reducers on every client, and the second is the one that falls behind
 * ([B-03](../../../../../docs/plans/04-transcript-and-resume/F0-transcript.md)).
 */
export interface TranscriptEvent {
  /** A `type` of the generated contract. */
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * One message of a conversation, and the events it amounts to.
 *
 * The page is counted in messages and delivered as events: one assistant message can be an answer
 * and the start of a tool at once, and one tool report can close several tools.
 */
export interface TranscriptMessage {
  /** The message's own id in the transcript — what a page cursor points at. */
  readonly id: string;
  readonly events: readonly TranscriptEvent[];
}
