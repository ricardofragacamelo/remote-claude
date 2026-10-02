/**
 * Where a conversation came from, as far as this product can prove.
 *
 * `ours` was opened here, by the person reading. Everything else is `external` — and deliberately
 * not "VSCode": the store is shared with the terminal too, and nothing reports which one began it.
 * A label naming the editor would be the screen asserting what nobody knows
 * ([D-01](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 */
export type ConversationOrigin = 'ours' | 'external';

/**
 * What a conversation is doing now, as the backend tells it (plan 08, B-08): live in a session of
 * this person here, recently written by something else — an estimate, and said to be one — or idle.
 */
export type ConversationActivity = 'liveHere' | 'activeElsewhere' | 'idle';

/** One conversation of Claude's store, as the history lists it. */
export interface ConversationSummary {
  /** The id in Claude's store — what a page of it is read by, and what a resume takes. */
  readonly conversationId: string;
  readonly summary: string;
  readonly origin: ConversationOrigin;

  /** Where it ran. A resume runs there too, and nowhere else. */
  readonly cwd: string;

  readonly gitBranch: string | null;

  /** ISO 8601. */
  readonly lastModified: string;

  /** What it is doing now. `idle` from a backend that does not say. */
  readonly activity: ConversationActivity;

  /** The live session of this person that holds it, when it is `liveHere`. */
  readonly liveSessionId: string | null;

  /** How long ago it was last written, by the backend's clock — what "written n min ago" says. */
  readonly writtenAgoSeconds: number | null;
}

/**
 * One event of the history: a frame of the live contract without its envelope.
 *
 * The **same** shape as `message.completed`, `tool.started` and `tool.completed` on the socket, so
 * history and the live stream go through one reducer — two readers of the same thing is how the
 * second one falls behind (B-03).
 */
export interface HistoryEvent {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** A page of a conversation: its latest messages, or the ones before a cursor. */
export interface HistoryPage {
  readonly conversation: ConversationSummary;

  /** Oldest first, within the page. */
  readonly events: readonly HistoryEvent[];

  /** Opaque: the page **before** this one. `null` on the first message of the conversation. */
  readonly nextCursor: string | null;
}
