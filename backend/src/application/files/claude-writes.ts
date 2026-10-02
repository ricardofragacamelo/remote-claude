import type { SessionFileStateRecorded } from '@application/shared';
import { Etag, originOf } from '@domain/files';
import type { WriteOutcome } from '@domain/files';
import type { Clock } from '@domain/shared';
import { RecentWrites, WRITE_MEMORY_ENTRIES, WRITE_MEMORY_MS } from './recent-writes';

/** How long a write of Claude's is remembered — long enough for the watcher to see it land. */
export const CLAUDE_WRITE_MEMORY_MS = WRITE_MEMORY_MS;

/** How many are remembered at most, so a session that writes ten thousand files costs a bounded map. */
export const CLAUDE_WRITE_MEMORY_ENTRIES = WRITE_MEMORY_ENTRIES;

/**
 * What Claude wrote lately, and how it left each file — the thread to the origin of a change.
 *
 * Fed by `session.fileStateRecorded` on the internal bus, which the `PostToolUse` hook publishes:
 * `files` learns of Claude's writes **without importing `session`** (plan 07, B-18, S-126). The
 * watcher asks it whether a change it saw is one of these — same path, same hash — to label the
 * change `claude` rather than `external` (B-22). A label, never a decision.
 */
export class ClaudeWrites extends RecentWrites {
  constructor(
    memoryMs: number = CLAUDE_WRITE_MEMORY_MS,
    maxEntries: number = CLAUDE_WRITE_MEMORY_ENTRIES,
  ) {
    super('claude', memoryMs, maxEntries);
  }

  /** Remembers a write; the oldest goes when the memory is full. */
  record(write: SessionFileStateRecorded): void {
    this.remember({
      path: write.path,
      left: { kind: 'content', hash: write.hash },
      subtree: false,
      at: write.at,
    });
  }

  /** Whether `path` holding `hash` at `at` is what Claude left there, recently enough to say so. */
  wrote(path: string, hash: string, at: Date): boolean {
    return originOf('changed', this.marksFor(path, at), Etag.ofDigest(hash)) === 'claude';
  }
}

/**
 * What the person wrote lately through the routes of `files` — saved, created, moved, copied,
 * deleted — and what each write left (07 · B-22). Fed by the write use cases once the disk took the
 * write, so a refused write leaves no mark.
 */
export class UserWrites extends RecentWrites {
  constructor(
    private readonly clock: Clock,
    memoryMs: number = WRITE_MEMORY_MS,
    maxEntries: number = WRITE_MEMORY_ENTRIES,
  ) {
    super('user', memoryMs, maxEntries);
  }

  /**
   * Remembers that a write of the person's left `left` at `path`, now.
   *
   * @param subtree the outcome holds for everything under `path` — a folder deleted, moved, copied
   */
  left(path: string, left: WriteOutcome, subtree: boolean): void {
    this.remember({ path, left, subtree, at: this.clock.now() });
  }
}
