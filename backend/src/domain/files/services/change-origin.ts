import type { Etag } from '../value-objects/etag.value-object';
import type { ChangeKind } from './folder-changes';

/** Who changed a path, as far as the server can tell — the contract's `changes[].origin`. */
export type ChangeOrigin = 'claude' | 'user' | 'external';

/** Who left a mark: a session of Claude, or a person through the routes of `files`. */
export type Writer = Exclude<ChangeOrigin, 'external'>;

/**
 * What a recent write left at a path.
 *
 * - `content` — a file with these bytes, by their SHA-256 in hex;
 * - `removed` — nothing: a delete, or the old place of a move;
 * - `anything` — something whose bytes were not hashed: a folder created, or the files inside a
 *   folder copied or moved, which arrive as one write and are seen as many changes.
 */
export type WriteOutcome =
  | { readonly kind: 'content'; readonly hash: string }
  | { readonly kind: 'removed' }
  | { readonly kind: 'anything' };

/** One recent write that could explain a change. */
export interface WriteMark {
  readonly by: Writer;
  readonly at: Date;
  readonly left: WriteOutcome;
}

/**
 * Whether telling the origin of a change needs the bytes on disk: only when a recent write left
 * known contents there to compare them with. A change nobody here wrote is `external` without
 * reading a byte — the watcher sees every change, and hashing each one would cost the disk what
 * the label is worth (07 · B-22).
 */
export function needsHash(kind: ChangeKind, marks: readonly WriteMark[]): boolean {
  return kind !== 'deleted' && marks.some((mark) => mark.left.kind === 'content');
}

/**
 * Who changed a path: the latest recent write whose outcome **is** what the disk holds now.
 *
 * - a deletion is the writer's who removed the path — a person's delete or move (S-149);
 * - anything else is the writer's whose contents match the bytes on disk — Claude's
 *   `session.fileStateRecorded` (S-148), or a person's save — or whose write left "anything" there;
 * - nothing matches → `external` (S-150).
 *
 * Claude and the person writing the same file inside the window are told apart by the **final**
 * bytes, never by who wrote last: a mark whose outcome is not on disk any more explains nothing,
 * and the origin is never invented (S-151). Two marks that both match — the same bytes, written
 * twice — go to the later one.
 *
 * A label for the screen, never a decision: neither security nor a conflict depends on it — a
 * conflict is the `ETag`'s.
 *
 * @param current the version on disk now; `null` when it was not read, or nothing is there
 */
export function originOf(
  kind: ChangeKind,
  marks: readonly WriteMark[],
  current: Etag | null,
): ChangeOrigin {
  const explaining = marks.filter((mark) => explains(mark.left, kind, current));
  const latest = explaining.reduce<WriteMark | null>(
    (best, mark) => (best === null || mark.at > best.at ? mark : best),
    null,
  );

  return latest?.by ?? 'external';
}

function explains(left: WriteOutcome, kind: ChangeKind, current: Etag | null): boolean {
  if (kind === 'deleted') {
    return left.kind === 'removed';
  }

  if (left.kind === 'content') {
    return current?.digest === left.hash;
  }

  return left.kind === 'anything';
}
