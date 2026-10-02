/**
 * What `Ctrl+Z` in the Explorer undoes: the last operation on files of this folder tab, by its
 * inverse (B-27) — as the editor people know does, and as the product prefers: undo instead of
 * confirm, where it can.
 *
 * Renaming, moving, creating and copying are undone; deleting is not, until the local history of F8.
 * Each inverse names the version the operation left (`If-Match`), so a file that changed since —
 * Claude wrote to it — is never undone over: the server answers `412`, and the screen says why
 * (S-185).
 */

/** One entry moved — a rename is a move inside its own folder. */
export interface MovedItem {
  readonly from: string;
  readonly to: string;

  /** The version of a file as the move left it; `null` for a folder. */
  readonly etag: string | null;
}

/** One entry an operation made — created, or a copy. */
export interface MadeItem {
  readonly path: string;
  readonly etag: string | null;
}

/** One operation of the stack, with every item it acted on. */
export type UndoEntry =
  | { readonly kind: 'rename'; readonly items: readonly MovedItem[] }
  | { readonly kind: 'move'; readonly items: readonly MovedItem[] }
  | { readonly kind: 'create'; readonly items: readonly MadeItem[] }
  | { readonly kind: 'copy'; readonly items: readonly MadeItem[] };

/** One request of an inverse. */
export type InverseStep =
  | {
      readonly op: 'move';
      readonly from: string;
      readonly to: string;
      readonly ifMatch: string | null;
    }
  | { readonly op: 'delete'; readonly path: string; readonly ifMatch: string | null };

/**
 * The requests that undo an operation, the last item first.
 *
 * A folder an operation made is deleted only while it is still empty: the request is not recursive,
 * so one that something was put in since answers `409` and stays (deleting what somebody else put
 * there is not an undo — it is a delete, which asks first).
 */
export function inverseOf(entry: UndoEntry): readonly InverseStep[] {
  if (entry.kind === 'rename' || entry.kind === 'move') {
    return [...entry.items]
      .reverse()
      .map((item) => ({ op: 'move', from: item.to, to: item.from, ifMatch: item.etag }));
  }

  return [...entry.items]
    .reverse()
    .map((item) => ({ op: 'delete', path: item.path, ifMatch: item.etag }));
}

/** What an inverse step acts on, for the result of each — the path the person sees now. */
export function subjectOf(step: InverseStep): string {
  return step.op === 'move' ? step.from : step.path;
}
