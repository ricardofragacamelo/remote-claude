import type { QueryClient } from '@tanstack/react-query';

import { entryMoved, openFile } from '@/features/editor';
import { undoDeletion } from '@/features/file-history';
import type { KeptEntry } from '@/features/file-history';
import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import { runEach } from '../lib/batch';
import type { ItemResult } from '../lib/batch';
import { duplicateName } from '../lib/duplicate-name';
import { childOf, isWithin, nameOf, outermost, parentOf } from '../lib/paths';
import { resolveTemplate, templateOf } from '../lib/templates';
import { inverseOf, subjectOf } from '../lib/undo';
import type { InverseStep, MadeItem, MovedItem } from '../lib/undo';
import {
  copyEntry,
  createEntry,
  deleteEntry,
  moveEntry,
  readFileText,
} from '../services/explorer.service';
import type { SensitiveOption } from '../services/explorer.service';
import { explorerStore } from '../store/explorer.store';
import type { Creating } from '../store/explorer.store';
import type { DirectoryListing, WrittenEntry } from '../types/explorer';
import { explorerKeys } from './explorer-keys';

/**
 * The operations on files of one folder tab — what each sends, and what the tab does once it went:
 * the levels read again, the selection on what was made, the editor told what moved, the inverse on
 * the undo stack. The screens decide when; this decides what.
 */
export interface FolderContext {
  readonly folder: string;
  readonly client: QueryClient;
}

/** A refusal made here, before any request — a batch that cannot be done (S-183). */
export function refusedHere(code: string, messageKey: string, params = {}): AppError {
  return new AppError(code, messageKey, 'local', params);
}

/** The levels an operation touched, read again now — the watcher would, a moment later. */
export function reread(context: FolderContext, levels: Iterable<string>): void {
  for (const level of new Set(levels)) {
    void context.client.invalidateQueries({
      queryKey: explorerKeys.directory(context.folder, level),
      exact: true,
    });
  }
}

/** The levels under a path that is gone, dropped from the cache. */
export function forgetUnder(context: FolderContext, path: string): void {
  context.client.removeQueries({
    queryKey: explorerKeys.directories(context.folder),
    predicate: (query) => {
      const level = query.queryKey[3];
      return typeof level === 'string' && isWithin(level, path);
    },
  });
}

/** The names a level holds, as far as the cache knows it. */
function namesIn(context: FolderContext, level: string): Set<string> {
  const listing = context.client.getQueryData<DirectoryListing>(
    explorerKeys.directory(context.folder, level),
  );

  return new Set(listing?.entries.map((entry) => entry.name) ?? []);
}

/** Whether a level already has an entry by that name — what the inline validation asks. */
export function isTaken(context: FolderContext, level: string, name: string): boolean {
  return namesIn(context, level).has(name);
}

/** What a new entry starts with: a template's text, resolved, or another file's text. */
async function contentOf(context: FolderContext, creating: Creating, name: string) {
  const template = creating.template === null ? undefined : templateOf(creating.template);

  if (template !== undefined) {
    return resolveTemplate(template, name, new Date());
  }

  return creating.source === null ? undefined : readFileText(context.folder, creating.source);
}

/**
 * Creates the entry being named in place — a file, a folder, from a template or from another file —
 * and opens a new file in the editor (S-168, S-169, S-170).
 */
export async function createNamed(
  context: FolderContext,
  creating: Creating,
  name: string,
  options: SensitiveOption = {},
): Promise<WrittenEntry> {
  const content = await contentOf(context, creating, name);
  const store = explorerStore(context.folder).getState();
  const written = await createEntry(context.folder, childOf(creating.parent, name), creating.kind, {
    ...options,
    ...(content === undefined ? {} : { content }),
  });

  reread(context, [creating.parent]);
  store.stopEditing();
  store.select([written.path], written.path);
  store.requestFocus();
  store.pushUndo({ kind: 'create', items: [{ path: written.path, etag: written.etag }] });
  store.announce('explorer.done.created', { name: nameOf(written.path) });

  if (creating.kind === 'file') {
    openFile(context.folder, written.path);
  }

  return written;
}

/** What follows a move: the editor's tabs, the tree's open folders and selection, the cache. */
function afterMoves(context: FolderContext, moved: readonly MovedItem[]): void {
  const store = explorerStore(context.folder).getState();

  for (const item of moved) {
    entryMoved(context.folder, item.from, item.to);
    store.moved(item.from, item.to);
    forgetUnder(context, item.from);
  }

  reread(
    context,
    moved.flatMap((item) => [parentOf(item.from), parentOf(item.to)]),
  );
}

/** Renames an entry in place — never over another one (S-171, S-172). */
export async function renameTo(
  context: FolderContext,
  path: string,
  name: string,
  options: SensitiveOption = {},
): Promise<WrittenEntry> {
  const store = explorerStore(context.folder).getState();
  const written = await moveEntry(context.folder, path, childOf(parentOf(path), name), options);
  const item = { from: path, to: written.path, etag: written.etag };

  afterMoves(context, [item]);
  store.stopEditing();
  store.select([written.path], written.path);
  store.requestFocus();
  store.pushUndo({ kind: 'rename', items: [item] });
  store.announce('explorer.done.renamed', { name: nameOf(written.path) });
  return written;
}

/** The refusal of a batch into one of its own entries — `culprit` is the entry it would go into. */
function intoItselfRefusal(culprit: string): AppError {
  return refusedHere('FILE_OPERATION_INVALID', 'files.error.operationInvalid', {
    path: culprit,
    reason: 'intoItself',
  });
}

/**
 * Moves entries into a folder, each by its own request, and answers how each went (S-175, S-182).
 * An entry already there is left alone.
 *
 * @throws {AppError} `FILE_OPERATION_INVALID` (`intoItself`) — the whole batch, before any request
 *   (S-176, S-183)
 */
export async function moveInto(
  context: FolderContext,
  paths: readonly string[],
  destination: string,
  options: SensitiveOption = {},
): Promise<readonly ItemResult[]> {
  const culprit = paths.find((path) => isWithin(destination, path));

  if (culprit !== undefined) {
    throw intoItselfRefusal(culprit);
  }

  const moved: MovedItem[] = [];
  const items = outermost(paths).filter((path) => parentOf(path) !== destination);
  const results = await runEach(
    items,
    (path) => path,
    async (path) => {
      const written = await moveEntry(
        context.folder,
        path,
        childOf(destination, nameOf(path)),
        options,
      );
      moved.push({ from: path, to: written.path, etag: written.etag });
    },
  );

  settleMade(context, 'move', moved, [destination]);
  return results;
}

/** Where a copy of `path` lands, and under what name: its own, or "copy" when it is taken (S-103). */
function copyTarget(
  context: FolderContext,
  path: string,
  destination: string,
  chosen: Set<string>,
) {
  const taken = (name: string): boolean =>
    namesIn(context, destination).has(name) || chosen.has(childOf(destination, name));
  const own = nameOf(path);
  const name = taken(own) ? duplicateName(own, taken) : own;
  const target = childOf(destination, name);

  chosen.add(target);
  return target;
}

/**
 * Copies entries — into one folder for "Paste", each beside itself for "Duplicate" — and answers how
 * each went (S-177).
 *
 * @param destinationOf the folder each entry is copied into
 * @throws {AppError} `FILE_OPERATION_INVALID` (`intoItself`) — a folder into itself, before any request
 */
export async function copyInto(
  context: FolderContext,
  paths: readonly string[],
  destinationOf: (path: string) => string,
  options: SensitiveOption = {},
): Promise<readonly ItemResult[]> {
  const items = outermost(paths);
  const stray = items.find((path) => isWithin(destinationOf(path), path));

  if (stray !== undefined) {
    throw intoItselfRefusal(stray);
  }

  const made: MadeItem[] = [];
  const chosen = new Set<string>();
  const results = await runEach(
    items,
    (path) => path,
    async (path) => {
      const target = copyTarget(context, path, destinationOf(path), chosen);
      const written = await copyEntry(context.folder, path, target, options);
      made.push({ path: written.path, etag: written.etag });
    },
  );

  settleMade(context, 'copy', made, items.map(destinationOf));
  return results;
}

/** What follows a batch: the levels read again, what was made selected, the inverse kept. */
function settleMade(
  context: FolderContext,
  kind: 'move' | 'copy',
  items: readonly MovedItem[] | readonly MadeItem[],
  levels: readonly string[],
): void {
  const store = explorerStore(context.folder).getState();
  reread(context, levels);

  if (items.length === 0) {
    return;
  }

  if (kind === 'move') {
    const moved = items as readonly MovedItem[];
    afterMoves(context, moved);
    store.pushUndo({ kind, items: moved });
    store.select(
      moved.map((item) => item.to),
      moved[0]?.to ?? null,
    );
  } else {
    const made = items as readonly MadeItem[];
    store.pushUndo({ kind, items: made });
    store.select(
      made.map((item) => item.path),
      made[0]?.path ?? null,
    );
  }

  store.announce(kind === 'move' ? 'explorer.done.moved' : 'explorer.done.copied', {
    count: items.length,
  });
}

/** One request of an inverse, and what follows it. */
async function undoStep(context: FolderContext, step: InverseStep): Promise<void> {
  if (step.op === 'move') {
    const written = await moveEntry(context.folder, step.from, step.to, { ifMatch: step.ifMatch });
    afterMoves(context, [{ from: step.from, to: written.path, etag: written.etag }]);
    return;
  }

  await deleteEntry(context.folder, step.path, { ifMatch: step.ifMatch });
  forgetUnder(context, step.path);
  reread(context, [parentOf(step.path)]);
}

/**
 * Undoes the last operation of this folder tab by its inverse, and answers how each item went —
 * `null` when there was nothing to undo (S-184, S-185). The operation leaves the stack before its
 * inverse is sent: undoing it again does nothing (S-186).
 */
export async function undoLast(context: FolderContext): Promise<readonly ItemResult[] | null> {
  const store = explorerStore(context.folder).getState();
  const entry = store.popUndo();

  if (entry === null) {
    return null;
  }

  logger.debug(
    { op: 'explorer.undo', folder: context.folder, kind: entry.kind, count: entry.items.length },
    'undoing a file operation',
  );

  const results = await runEach(inverseOf(entry), subjectOf, (step) => undoStep(context, step));

  if (results.every((result) => result.ok)) {
    store.announce('explorer.done.undone', { count: results.length });
  }

  return results;
}

/**
 * The "Undo" of a delete the local history kept (07 · B-58, S-344): each entry of it — of `paths`,
 * on a second round after the sensitive step — restored where it was, and the levels read again.
 */
export async function undoDeleted(
  context: FolderContext,
  entries: readonly KeptEntry[],
  paths: readonly string[],
  confirmSensitive: boolean,
): Promise<readonly ItemResult[]> {
  const asked = entries.filter((entry) => paths.includes(entry.path));
  const results = await undoDeletion(context.client, context.folder, asked, confirmSensitive);

  reread(
    context,
    asked.map((entry) => parentOf(entry.path)),
  );

  if (results.every((result) => result.ok)) {
    explorerStore(context.folder)
      .getState()
      .announce('explorer.done.restored', { count: results.length });
  }

  return results;
}
