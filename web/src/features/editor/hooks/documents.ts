import { AppError } from '@/shared/api/errors';
import type { FolderChange } from '@/shared/api/folder-watches';
import { newTraceId } from '@/shared/lib/trace';
import { logger } from '@/shared/logging/logger';
import { PLAIN_TEXT } from '../lib/languages';
import { detectIndentation } from '../lib/text';
import { readFile } from '../services/files.service';
import type { FileText, ReadOptions, ReadResult } from '../services/files.service';
import { editorStoreOf, isDirty, updateDoc } from '../store/editor.store';
import type { EditorStore } from '../store/editor.store';
import { useEditorPreferences } from '../store/preferences.store';
import type { CodeEditorEngine, TextModel, TextPosition } from '../types/code-editor';
import type { ChangeOrigin, FileDocument } from '../types/editor';

/** Any failure as the `AppError` the screen shows. */
export function asAppError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError('INTERNAL_ERROR', 'common.error.unexpected', newTraceId());
}

/** The adapter each model was made by — a view of one never shows a model of the other. */
const engineOf = new WeakMap<TextModel, CodeEditorEngine['kind']>();

/** How each model's changes reach its file's state — stopped when the model goes. */
const following = new WeakMap<TextModel, () => void>();

/** Where a reloaded text puts the cursor and the scroll back, until a view has done it (S-238). */
const restoring = new Map<string, { readonly cursor: TextPosition; readonly scrollTop: number }>();

/** Files whose disk changed while a save was on its way: checked again once it lands (S-241). */
const recheck = new Set<string>();

/** Pending auto-saves, by file (S-236). */
const autoSaves = new Map<string, ReturnType<typeof setTimeout>>();

/** How long after the last edit "after a delay" saves. */
export const AUTO_SAVE_DELAY_MS = 1_000;

function keyOf(folder: string, path: string): string {
  return `${folder}\n${path}`;
}

/** Told when a file's text changed — the save of `saving.ts`, wired once at load. */
let autoSaver: (folder: string, path: string) => void = () => undefined;

/** Hands the documents the way to auto-save — done once, by the editor's registration. */
export function setAutoSaver(save: (folder: string, path: string) => void): void {
  autoSaver = save;
}

function scheduleAutoSave(folder: string, path: string): void {
  if (useEditorPreferences.getState().preferences.autoSave !== 'afterDelay') {
    return;
  }

  const key = keyOf(folder, path);
  clearTimeout(autoSaves.get(key));
  autoSaves.set(
    key,
    setTimeout(() => {
      autoSaves.delete(key);
      autoSaver(folder, path);
    }, AUTO_SAVE_DELAY_MS),
  );
}

/** A model no longer the file's: no longer followed, and disposed of. */
function drop(model: TextModel | null): void {
  if (model !== null) {
    following.get(model)?.();
    model.dispose();
  }
}

/** Stops whatever was pending for a file whose text is going away. */
export function letGoOf(folder: string, doc: FileDocument): void {
  const key = keyOf(folder, doc.path);
  clearTimeout(autoSaves.get(key));
  autoSaves.delete(key);
  restoring.delete(key);
  recheck.delete(key);
  drop(doc.model);
}

/** A file's first edit pins its preview tab: what is being edited is not replaced (S-209). */
function pinPreviewsOf(store: EditorStore, path: string): void {
  const { groups } = store.getState();

  if (
    groups.some((group) =>
      group.tabs.some((tab) => tab.preview && tab.kind === 'file' && tab.path === path),
    )
  ) {
    store.setState({
      groups: groups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) =>
          tab.kind === 'file' && tab.path === path ? { ...tab, preview: false } : tab,
        ),
      })),
    });
  }
}

/** Follows a model's changes into its file's state: the version, the language, the auto-save. */
function follow(folder: string, path: string, model: TextModel): void {
  const store = editorStoreOf(folder);

  following.set(
    model,
    model.onDidChange(() => {
      const doc = store.getState().docs[path];

      if (doc?.model !== model) {
        return;
      }

      const edited = model.version() !== doc.version;
      updateDoc(store, path, () => ({ version: model.version(), language: model.language() }));

      if (edited && isDirty(store.getState().docs[path])) {
        pinPreviewsOf(store, path);
        scheduleAutoSave(folder, path);
      }
    }),
  );
}

/** What a read tells the file's state, besides its text. */
function readState(file: FileText): Partial<FileDocument> {
  return {
    status: 'ready',
    failure: null,
    etag: file.etag,
    encoding: file.format.encoding,
    bom: file.format.bom,
    readEol: file.format.eol,
    size: file.size,
    light: file.largeFile,
    deleted: false,
    external: null,
  };
}

/**
 * Reads a file not read yet — or that failed, when asked again. Its text waits in `pending` until an
 * editor makes a model of it.
 */
export async function ensureLoaded(folder: string, path: string, again = false): Promise<void> {
  const store = editorStoreOf(folder);
  const doc = store.getState().docs[path];

  if (doc === undefined || !(doc.status === 'idle' || (again && doc.status === 'failed'))) {
    return;
  }

  updateDoc(store, path, () => ({ status: 'loading', failure: null }));

  try {
    const read = await readFile(folder, path);

    if (read.kind === 'read') {
      updateDoc(store, path, (current) => ({
        ...readState(read.file),
        pending: read.file.content,
        language: read.file.largeFile ? PLAIN_TEXT : current.language,
        // Large files are not scanned: the light mode is about not walking the whole text.
        indentation: read.file.largeFile ? null : detectIndentation(read.file.content),
      }));
    }
  } catch (error) {
    updateDoc(store, path, () => ({ status: 'failed', failure: asAppError(error) }));
  }
}

/**
 * The model of a read file for an editor: made from the text read, or — when the other adapter made
 * it, the window crossed `md` — moved over, keeping whether it is dirty.
 *
 * @throws {Error} for a file that is not read yet — the view is only made for one that is
 */
export function attachModel(folder: string, path: string, engine: CodeEditorEngine): TextModel {
  const store = editorStoreOf(folder);
  const doc = store.getState().docs[path];

  if (doc === undefined || doc.status !== 'ready') {
    // A view asks only for a file it was given ready: anything else is a bug to see, not to hide.
    throw new Error(`${path} is not read yet`);
  }

  if (doc.model !== null && engineOf.get(doc.model) === engine.kind) {
    return doc.model;
  }

  const eol = doc.readEol === 'crlf' ? 'crlf' : 'lf';
  const model = engine.createModel(
    doc.model === null
      ? { content: doc.pending ?? '', eol, language: doc.language }
      : { content: doc.model.getValue(), eol: doc.model.eol(), language: doc.model.language() },
  );
  const dirty = isDirty(doc);
  drop(doc.model);

  engineOf.set(model, engine.kind);
  updateDoc(store, path, () => ({
    model,
    pending: null,
    version: model.version(),
    // Moved over dirty, it stays dirty: nothing the person typed is ever shown as saved.
    savedVersion: dirty ? -1 : model.version(),
  }));
  follow(folder, path, model);

  return model;
}

/** An open file whose text an editor made — `null` for one not open, or not made yet. */
export function withModel(
  folder: string,
  path: string,
): { doc: FileDocument; model: TextModel } | null {
  const doc = editorStoreOf(folder).getState().docs[path];
  const model = doc?.model ?? null;

  return doc === undefined || model === null ? null : { doc, model };
}

/**
 * An open file of a folder tab, which the caller knows is open.
 *
 * @throws {Error} for a file that is not — a bug to see, not to hide
 */
export function documentOf(folder: string, path: string): FileDocument {
  const doc = editorStoreOf(folder).getState().docs[path];

  if (doc === undefined) {
    throw new Error(`${path} is not open`);
  }

  return doc;
}

/** What the editor holds of a file — what a restore of the local history needs to know first. */
export interface HeldFile {
  /** The version on disk the buffer was read as — `null` before it was read. */
  readonly etag: string | null;

  /** The buffer has changes the disk does not. */
  readonly dirty: boolean;

  /** Deleted on disk under its tab. */
  readonly deleted: boolean;
}

/** What the editor holds of a file of the folder — `null` when it is not open (07 · B-59). */
export function heldFile(folder: string, path: string): HeldFile | null {
  const doc = editorStoreOf(folder).getState().docs[path];

  return doc === undefined ? null : { etag: doc.etag, dirty: isDirty(doc), deleted: doc.deleted };
}

/** Where the cursor and the scroll go back to after a reload, once — the view's to ask. */
export function takeRestore(
  folder: string,
  path: string,
): { cursor: TextPosition; scrollTop: number } | undefined {
  const key = keyOf(folder, path);
  const restore = restoring.get(key);
  restoring.delete(key);
  return restore;
}

/**
 * Puts what the disk has in a file's buffer — clean, its undo history started over only for this
 * file (B-36) — keeping the cursor and the scroll where they were (S-238).
 */
export function putRead(folder: string, path: string, file: FileText): void {
  const store = editorStoreOf(folder);
  const doc = store.getState().docs[path];

  if (doc === undefined) {
    return;
  }

  if (doc.model === null) {
    updateDoc(store, path, () => ({ ...readState(file), pending: file.content }));
    return;
  }

  restoring.set(keyOf(folder, path), { cursor: doc.cursor, scrollTop: doc.scrollTop });
  doc.model.reload(file.content);
  updateDoc(store, path, () => ({
    ...readState(file),
    version: doc.model?.version() ?? 0,
    savedVersion: doc.model?.version() ?? 0,
    conflict: null,
    saveError: null,
  }));
}

/**
 * Reads a file again — with an encoding when given — and puts what the disk has in its buffer. A file
 * no longer there is marked deleted; any other refusal is said where the save error is.
 */
export async function readAgain(folder: string, path: string, options: ReadOptions): Promise<void> {
  const store = editorStoreOf(folder);

  try {
    const read = await readFile(folder, path, options);

    if (read.kind === 'read') {
      putRead(folder, path, read.file);
    }
  } catch (error) {
    const failure = asAppError(error);
    updateDoc(store, path, () =>
      failure.code === 'FILE_NOT_FOUND'
        ? { deleted: true, conflict: null }
        : { saveError: failure },
    );
  }
}

/** Reads a file again from disk, and drops the buffer — "Revert", "Reload" (S-235). */
export async function reloadFromDisk(folder: string, path: string): Promise<void> {
  const doc = editorStoreOf(folder).getState().docs[path];

  if (doc !== undefined) {
    await readAgain(folder, path, encodingOf(doc));
  }
}

/** A file reopened with an encoding is read with it again — never detected back to UTF-8. */
function encodingOf(doc: FileDocument): { encoding?: string } {
  return doc.encoding === 'utf8' ? {} : { encoding: doc.encoding };
}

/**
 * Asks the disk whether a file is still the version in the editor — `If-None-Match`, so the usual
 * answer costs nothing (`304`) — and acts on the answer:
 *
 * - the same version: nothing — which is how the echo of our own save stays silent (S-241);
 * - another, under a clean buffer: reloaded, cursor and scroll kept (S-238);
 * - another, under a dirty buffer: the warning, with who did it; nothing is lost (S-239, S-242);
 * - gone: the tab is marked deleted (S-240).
 */
export async function revalidate(
  folder: string,
  path: string,
  origin: ChangeOrigin | null = null,
): Promise<void> {
  const store = editorStoreOf(folder);
  const doc = store.getState().docs[path];

  if (doc === undefined || doc.status !== 'ready' || doc.etag === null) {
    return;
  }

  if (doc.saving) {
    recheck.add(keyOf(folder, path));
    return;
  }

  try {
    const read = await readFile(folder, path, { ...encodingOf(doc), ifNoneMatch: doc.etag });
    answered(folder, path, read, origin);
  } catch (error) {
    const failure = asAppError(error);

    if (failure.code === 'FILE_NOT_FOUND') {
      updateDoc(store, path, () => ({ deleted: true }));
    } else {
      logger.warn({ op: 'editor.revalidate', folder, code: failure.code }, 'file not revalidated');
    }
  }
}

/** What the disk answered a revalidation, applied to the file as it is now. */
function answered(
  folder: string,
  path: string,
  read: ReadResult,
  origin: ChangeOrigin | null,
): void {
  const store = editorStoreOf(folder);
  const now = store.getState().docs[path];

  if (now === undefined) {
    return;
  }

  if (read.kind === 'notModified') {
    updateDoc(store, path, () => ({ deleted: false }));
  } else if (isDirty(now)) {
    updateDoc(store, path, () => ({ external: { origin }, deleted: false }));
  } else {
    putRead(folder, path, read.file);
  }
}

/** A save landed: whatever changed meanwhile is asked about now, against the version it left. */
export function savedNow(folder: string, path: string): void {
  if (recheck.delete(keyOf(folder, path))) {
    void revalidate(folder, path);
  }
}

/** Every open file read, revalidated — the tab came back on screen, or the socket did (S-259, S-263). */
export async function revalidateAll(folder: string): Promise<void> {
  const paths = Object.keys(editorStoreOf(folder).getState().docs);
  await Promise.all(paths.map((path) => revalidate(folder, path)));
}

/**
 * What changed on disk in the folder, applied to its open files (B-35). `overflow` — more changed
 * than was said — checks every one of them.
 */
export async function diskChanged(
  folder: string,
  changes: readonly FolderChange[],
  overflow: boolean,
): Promise<void> {
  const store = editorStoreOf(folder);
  const open = Object.keys(store.getState().docs);

  if (overflow) {
    await revalidateAll(folder);
    return;
  }

  await Promise.all(
    changes
      .filter((change) => open.includes(change.path))
      .map((change) => {
        if (change.kind === 'deleted') {
          updateDoc(store, change.path, () => ({ deleted: true }));
          return Promise.resolve();
        }

        return revalidate(folder, change.path, change.origin ?? null);
      }),
  );
}
