import type { WriteMark, WriteOutcome, Writer } from '@domain/files';

/** How long a write is remembered — long enough for the watcher to see it land. */
export const WRITE_MEMORY_MS = 60_000;

/** How many are remembered at most, so a burst of ten thousand writes costs a bounded map. */
export const WRITE_MEMORY_ENTRIES = 1_000;

/** One write, as it is remembered. */
export interface RecentWrite {
  /** The real path written. */
  readonly path: string;
  readonly left: WriteOutcome;
  /**
   * The outcome holds for everything **under** the path too — a folder deleted, moved or copied as
   * one write, seen by the watcher as one change per entry inside it.
   */
  readonly subtree: boolean;
  readonly at: Date;
}

/**
 * What one writer wrote lately, and what each write left on disk — the thread from a change the
 * watcher saw back to who made it (07 · B-22).
 *
 * Bounded twice: by age, because a write a minute old explains nothing the watcher sees now, and
 * by count, the oldest going first. A label, never a decision — losing a mark costs an `external`
 * where a `claude` would have been, and nothing else.
 */
export class RecentWrites {
  private readonly writes = new Map<string, RecentWrite>();

  constructor(
    private readonly by: Writer,
    private readonly memoryMs: number = WRITE_MEMORY_MS,
    private readonly maxEntries: number = WRITE_MEMORY_ENTRIES,
  ) {}

  /** Remembers a write; a later one of the same path replaces it, and the oldest goes when full. */
  remember(write: RecentWrite): void {
    this.writes.delete(write.path);
    this.writes.set(write.path, write);

    for (const path of this.writes.keys()) {
      if (this.writes.size <= this.maxEntries) {
        break;
      }

      this.writes.delete(path);
    }
  }

  /**
   * The recent writes that could explain a change of `path` at `now`: its own, and those of the
   * folders above it that hold for their whole subtree.
   */
  marksFor(path: string, now: Date): WriteMark[] {
    return ancestry(path)
      .map((candidate) => this.writes.get(candidate))
      .filter((write): write is RecentWrite => write !== undefined)
      .filter((write) => write.path === path || write.subtree)
      .filter((write) => now.getTime() - write.at.getTime() <= this.memoryMs)
      .map((write) => ({ by: this.by, at: write.at, left: write.left }));
  }
}

/** The path and every folder above it, nearest first. */
function ancestry(path: string): string[] {
  const paths: string[] = [];

  for (let current = path; current.length > 0;) {
    paths.push(current);
    const cut = current.lastIndexOf('/');
    current = cut <= 0 ? '' : current.slice(0, cut);
  }

  return paths;
}
