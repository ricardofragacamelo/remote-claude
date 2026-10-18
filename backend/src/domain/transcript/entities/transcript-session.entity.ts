import type { ConversationRef } from '@domain/engine';

/**
 * Where a conversation came from, as far as this product can prove.
 *
 * `ours` is a session this backend opened — we hold a row of it. Everything else is `external`,
 * and deliberately not "VSCode": the store is shared with the terminal too, and the engine reports no
 * provenance at all, so a label naming the editor would be the UI asserting what nobody knows
 * ([D-01](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 */
export type TranscriptOrigin = 'ours' | 'external';

/**
 * One conversation in the engine's store, as the engine describes it — never as the JSONL spells it.
 *
 * It carries metadata only. The messages are read separately, and only when somebody opens it:
 * listing is cheap and reading is not (~30 MB of heap for the largest file measured).
 */
export interface TranscriptSession {
  readonly id: ConversationRef;

  /** The display title: a custom title, the engine's summary, or the first prompt. */
  readonly summary: string;

  /**
   * The working directory the engine recorded, raw. `null` when it recorded none — 18 % of the store
   * measured — which is not an edge case, and which is excluded: there is no way to prove such a
   * session belongs to an allowed root.
   */
  readonly cwd: string | null;

  readonly gitBranch: string | null;
  readonly createdAt: Date | null;

  /**
   * Milliseconds since the epoch, as the engine reports it.
   *
   * A number and not a `Date`, because it is a key twice over: the cache is invalidated by it, and
   * the listing cursor is built from it. A round trip through `Date` is exact today; a key should
   * not depend on that staying true.
   */
  readonly lastModified: number;
}

/** A conversation as a caller sees it: the metadata, plus where it came from. */
export interface VisibleTranscriptSession extends TranscriptSession {
  readonly origin: TranscriptOrigin;
}
