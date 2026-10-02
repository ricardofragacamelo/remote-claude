/** What happened to one path of a watched folder — the contract's `changes[].kind`. */
export type ChangeKind = 'created' | 'changed' | 'deleted';

/** One path that changed, relative to the folder it is told about. */
export interface FolderChange {
  /** POSIX, relative; `''` is the folder itself. */
  readonly path: string;
  readonly kind: ChangeKind;
}

/**
 * What one path amounts to after a second thing happened to it inside the same window, or `null`
 * when the two cancel out.
 *
 * The window exists so a burst reads as what it left behind, never as the burst (07 · B-20):
 *
 * - a file written five hundred times is one `changed` (S-131);
 * - created then deleted is nothing — it was never there for the client to show (S-132);
 * - created then written is still `created`; written then deleted is `deleted`;
 * - deleted then created is `changed` — an atomic save of an editor, a `git checkout`: the path is
 *   there before and after, with other contents.
 *
 * A rename is not tracked as one: the watcher reports the old path gone and the new one there, and
 * each folds on its own into `deleted` + `created` (S-130) — the web needs nothing more.
 *
 * @param previous what the path amounted to so far in the window, `undefined` when nothing
 */
export function foldChange(previous: ChangeKind | undefined, next: ChangeKind): ChangeKind | null {
  if (previous === undefined) {
    return next;
  }

  if (previous === 'created') {
    return next === 'deleted' ? null : 'created';
  }

  return next === 'deleted' ? 'deleted' : 'changed';
}

/**
 * Folds one more raw change into what a window holds so far, in place.
 *
 * A path whose changes cancel out leaves the window; the order of the others is the order in which
 * each first changed.
 */
export function foldInto(window: Map<string, ChangeKind>, change: FolderChange): void {
  const folded = foldChange(window.get(change.path), change.kind);

  if (folded === null) {
    window.delete(change.path);
  } else {
    window.set(change.path, folded);
  }
}

/** A burst of raw changes, as the window leaves them. */
export function coalesceChanges(raw: readonly FolderChange[]): FolderChange[] {
  const window = new Map<string, ChangeKind>();

  for (const change of raw) {
    foldInto(window, change);
  }

  return [...window].map(([path, kind]) => ({ path, kind }));
}

/**
 * The changes of a watched folder as a subfolder of it sees them, its prefix taken off — or
 * `null` for a path outside it.
 *
 * One watcher serves a folder and every subfolder opened under it (`/r/app` and `/r/app/pkg`,
 * 07 · B-21): each subscription is told only about its own, relative to itself. The same rule
 * places a folder under the root of a watcher, the two given as absolute paths.
 *
 * @param prefix where the subfolder sits in the watched one; `''` is the watched folder itself
 */
export function relativeTo(prefix: string, path: string): string | null {
  if (prefix === '') {
    return path;
  }

  if (path === prefix) {
    return '';
  }

  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : null;
}

/**
 * Whether deleting `deleted` takes the subfolder at `prefix` with it: it is the subfolder, one of
 * the folders above it, or the watched folder itself.
 */
export function takesAway(deleted: string, prefix: string): boolean {
  return deleted === '' || deleted === prefix || prefix.startsWith(`${deleted}/`);
}

/** One event's worth of changes: at most `ceiling` of them, and whether there were more. */
export interface ChangeBatch<T extends FolderChange = FolderChange> {
  readonly changes: readonly T[];
  /** More changed than the event carries: the client reloads instead of patching (S-133). */
  readonly overflow: boolean;
}

/** The changes, cut at the ceiling of one event. */
export function batchOf<T extends FolderChange>(
  changes: readonly T[],
  ceiling: number,
): ChangeBatch<T> {
  return changes.length > ceiling
    ? { changes: changes.slice(0, ceiling), overflow: true }
    : { changes, overflow: false };
}
