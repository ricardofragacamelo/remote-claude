import { isRecord } from './json';
import { createRegistry } from './registry';
import type { RegistryEntry } from './registry';

/**
 * The type of the files a person drags out of the tree or the editor tabs, towards Claude
 * ([07 · D-20](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-20--o-que-se-arrasta-para-o-claude)).
 * `text/plain` goes along with it, for whoever drops into an ordinary text field.
 */
export const FILES_DRAG_TYPE = 'application/x-remote-claude-files+json';

/** One dragged entry, relative to the folder of the tab it came from. */
export interface DraggedEntry {
  /** Relative to `folder`, POSIX. */
  readonly path: string;

  /** A directory goes as itself, never expanded into what it holds. */
  readonly kind: 'file' | 'directory';
}

/** A range of text, 1-based, as an editor reports a selection. */
export interface TextRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/** What is dragged — or handed by "Add to Claude's context". */
export interface FilesDragPayload {
  /** The folder of the tab it came from, absolute — the same `folder` as the API (07 · D-11). */
  readonly folder: string;
  readonly entries: readonly DraggedEntry[];

  /** A selection of an editor, with the file it is in. */
  readonly selection?: { readonly path: string; readonly range: TextRange };
}

/** Why an entry of the tree cannot go along. */
export type InoperableReason = 'unreadableName' | 'outsideLink';

/** An entry as the tree knows it, before it is dragged. */
export interface DragCandidate extends DraggedEntry {
  /** Set when the entry cannot be acted on: a name that is not text, a link out of the folder. */
  readonly inoperable?: InoperableReason;
}

/** An entry left out, and why — the item that offered it says so. */
export interface LeftOut<Reason extends string> {
  readonly path: string;
  readonly reason: Reason;
}

/** What a drag carries, and what it could not. */
export interface BuiltPayload {
  /** `null` when nothing could go. */
  readonly payload: FilesDragPayload | null;
  readonly excluded: readonly LeftOut<InoperableReason>[];
}

/**
 * The payload of a drag of entries of one folder, in the order given — the tree's order.
 *
 * What cannot be acted on stays out and is listed with its reason (S-274); a directory goes as one
 * entry (S-271).
 */
export function filesDragPayload(
  folder: string,
  candidates: readonly DragCandidate[],
  selection?: FilesDragPayload['selection'],
): BuiltPayload {
  const excluded = candidates.flatMap((candidate) =>
    candidate.inoperable === undefined
      ? []
      : [{ path: candidate.path, reason: candidate.inoperable }],
  );
  const entries = candidates
    .filter((candidate) => candidate.inoperable === undefined)
    .map(({ path, kind }) => ({ path, kind }));

  if (entries.length === 0 && selection === undefined) {
    return { payload: null, excluded };
  }

  return {
    payload: { folder, entries, ...(selection === undefined ? {} : { selection }) },
    excluded,
  };
}

/** The half of a `DataTransfer` a drag writes to. */
export interface DragDataSink {
  setData(format: string, data: string): void;
}

/** The half of a `DataTransfer` a drop reads from. */
export interface DragDataSource {
  getData(format: string): string;
}

/** The paths a payload carries, one per line — the `text/plain` of a drag. */
export function plainPaths(payload: FilesDragPayload): string {
  const paths = payload.entries.map((entry) => entry.path);

  if (payload.selection !== undefined && !paths.includes(payload.selection.path)) {
    paths.push(payload.selection.path);
  }

  return paths.join('\n');
}

/** Puts a payload on a drag, in both of its formats (S-269). */
export function writeFilesDrag(data: DragDataSink, payload: FilesDragPayload): void {
  data.setData(FILES_DRAG_TYPE, JSON.stringify(payload));
  data.setData('text/plain', plainPaths(payload));
}

function isRange(value: unknown): value is TextRange {
  return (
    isRecord(value) &&
    ['startLine', 'startColumn', 'endLine', 'endColumn'].every(
      (key) => Number.isInteger(value[key]) && (value[key] as number) >= 1,
    )
  );
}

function isEntry(value: unknown): value is DraggedEntry {
  return (
    isRecord(value) &&
    typeof value['path'] === 'string' &&
    (value['kind'] === 'file' || value['kind'] === 'directory')
  );
}

/**
 * A payload read back from a drop, as far as it can be trusted — `null` for anything else. What a
 * target trusts is still only a convenience: the backend checks every path it is handed.
 */
export function readFilesDrag(data: DragDataSource): FilesDragPayload | null {
  const parsed = parsedDrag(data);

  if (
    !isRecord(parsed) ||
    typeof parsed['folder'] !== 'string' ||
    !Array.isArray(parsed['entries']) ||
    !parsed['entries'].every(isEntry)
  ) {
    return null;
  }

  const selection = parsed['selection'];

  if (selection !== undefined && !isSelection(selection)) {
    return null;
  }

  return {
    folder: parsed['folder'],
    entries: parsed['entries'].map(({ path, kind }) => ({ path, kind })),
    ...(selection === undefined
      ? {}
      : { selection: { path: selection.path, range: selection.range } }),
  };
}

/** The JSON of a drop, or `undefined` when it is not JSON. */
function parsedDrag(data: DragDataSource): unknown {
  try {
    return JSON.parse(data.getData(FILES_DRAG_TYPE));
  } catch {
    return undefined;
  }
}

function isSelection(value: unknown): value is NonNullable<FilesDragPayload['selection']> {
  return isRecord(value) && typeof value['path'] === 'string' && isRange(value['range']);
}

/** A folder without the slashes it may end with — the root stays `/`. */
function trimmed(folder: string): string {
  const bare = folder.replace(/\/+$/, '');
  return bare === '' ? '/' : bare;
}

/** `path` of `folder`, absolute. */
function absolute(folder: string, path: string): string {
  const base = trimmed(folder);
  const relative = path.replace(/^\.?\/+/, '').replace(/^\.$/, '');

  if (relative === '') {
    return base;
  }

  return base === '/' ? `/${relative}` : `${base}/${relative}`;
}

/** `target` relative to `folder`, or `null` when it is not inside it. */
function relativeTo(folder: string, target: string): string | null {
  const base = trimmed(folder);

  if (target === base) {
    return '';
  }

  const prefix = base === '/' ? '/' : `${base}/`;

  return target.startsWith(prefix) ? target.slice(prefix.length) : null;
}

/** A payload as another folder tab reads it. */
export interface ScopedPayload {
  /** What the target folder contains, relative to it; `null` when it contains none of it. */
  readonly payload: FilesDragPayload | null;
  readonly refused: readonly LeftOut<'outsideFolder'>[];
}

/**
 * Re-scopes a payload to the folder of the tab it is dropped on (S-273).
 *
 * Dragging from `/r/app/pkg` into the chat of `/r/app` is legitimate — the paths are inside —, and
 * is answered relative to `/r/app`; the other way round, what the target does not contain is
 * refused with `outsideFolder`. Both ends agreeing here is why this is one function in `shared/`
 * and not a decision of each.
 */
export function scopeDragPayload(payload: FilesDragPayload, targetFolder: string): ScopedPayload {
  const refused: LeftOut<'outsideFolder'>[] = [];

  const rescope = (path: string): string | null => {
    const scoped = relativeTo(targetFolder, absolute(payload.folder, path));

    if (scoped === null) {
      refused.push({ path, reason: 'outsideFolder' });
    }

    return scoped;
  };

  const entries = payload.entries.flatMap((entry) => {
    const path = rescope(entry.path);
    return path === null ? [] : [{ path, kind: entry.kind }];
  });

  const selectionPath = payload.selection === undefined ? null : rescope(payload.selection.path);
  const selection =
    payload.selection === undefined || selectionPath === null
      ? undefined
      : { path: selectionPath, range: payload.selection.range };

  if (entries.length === 0 && selection === undefined) {
    return { payload: null, refused };
  }

  return {
    payload: {
      folder: trimmed(targetFolder),
      entries,
      ...(selection === undefined ? {} : { selection }),
    },
    refused,
  };
}

/**
 * Whoever takes files into Claude's context — the panel of plan 08. Registered, "Add to Claude's
 * context" shows; unregistered, it does not, and a drag only moves inside the tree (S-276).
 */
export interface ClaudeContextTarget extends RegistryEntry {
  /** Takes the payload. Repeating an action hands it again — dropping repeats is the target's (S-278). */
  add(payload: FilesDragPayload): void;
}

/** The targets of "Add to Claude's context" and of the drag towards the chat. */
export const claudeContextTargets = createRegistry<ClaudeContextTarget>('claude context targets');

/**
 * Hands a payload to Claude's context, when somebody takes it.
 *
 * @returns whether a target took it
 */
export function addToClaudeContext(
  payload: FilesDragPayload,
  targets = claudeContextTargets,
): boolean {
  const target = targets.entries()[0];

  if (target === undefined) {
    return false;
  }

  target.add(payload);
  return true;
}
