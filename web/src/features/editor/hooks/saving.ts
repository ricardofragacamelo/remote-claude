import type { AppError } from '@/shared/api/errors';
import { sensitiveSubject } from '@/shared/lib/sensitive-files';
import { logger } from '@/shared/logging/logger';
import { adjustForSave } from '../lib/text';
import { createFile, saveFile } from '../services/files.service';
import { editorStoreOf, isDirty, updateDoc } from '../store/editor.store';
import { useEditorPreferences } from '../store/preferences.store';
import type { TextModel } from '../types/code-editor';
import type { FileDocument, SaveOutcome } from '../types/editor';
import { asAppError, savedNow, withModel } from './documents';
import { closeNow, moveSaved, openFile } from './tabs';

/** How a save went. */
export type SaveResult =
  | { readonly outcome: 'saved' | 'unchanged' }
  /** A question is on screen first — the second step of a sensitive file, or "recreate it?". */
  | { readonly outcome: 'asked' }
  | { readonly outcome: 'failed'; readonly error: AppError };

/** What a save may be told besides the file. */
export interface SaveOptions {
  /** The second step of a file that changes what Claude may do was answered (07 · D-15). */
  readonly confirmSensitive?: boolean;

  /** "Overwrite": the version the `412` brought, saved over on purpose (S-228). */
  readonly overwrite?: string;

  /** "Save with encoding" (S-249). */
  readonly encoding?: string;

  /** An auto-save: never asks a question, and leaves a file with one pending alone (S-236). */
  readonly automatic?: boolean;
}

/** One save at a time per file: the next waits for the one on its way (S-227). */
const queues = new Map<string, Promise<SaveResult>>();

function needsAnswer(doc: FileDocument): boolean {
  return doc.conflict !== null || doc.external !== null || doc.deleted || doc.sensitiveAsked;
}

/** What a failed save leaves on the file — the conflict, the second step, or the error itself. */
function failed(folder: string, path: string, error: AppError): void {
  const store = editorStoreOf(folder);

  if (error.code === 'FILE_CHANGED') {
    const current = error.params['currentEtag'];
    updateDoc(store, path, () => ({
      conflict: { currentEtag: typeof current === 'string' ? current : null, asking: true },
    }));
  } else if (error.code === 'PRECONDITION_REQUIRED' && error.params['reason'] === 'sensitiveFile') {
    updateDoc(store, path, () => ({ sensitiveAsked: true }));
  } else {
    updateDoc(store, path, () => ({ saveError: error }));
  }
}

/** A write landed: the version on disk is the buffer's as it was sent, and nothing is pending. */
function landed(
  folder: string,
  path: string,
  written: { readonly etag: string; readonly version: number },
  extra: Partial<FileDocument> = {},
): SaveResult {
  updateDoc(editorStoreOf(folder), path, () => ({
    etag: written.etag,
    savedVersion: written.version,
    saving: false,
    conflict: null,
    external: null,
    ...extra,
  }));
  return { outcome: 'saved' };
}

/** A write refused: said where it belongs — the conflict, the second step, or the error. */
function refusedWith(folder: string, path: string, error: unknown): SaveResult {
  const failure = asAppError(error);
  updateDoc(editorStoreOf(folder), path, () => ({ saving: false }));
  failed(folder, path, failure);
  logger.warn({ op: 'editor.save', folder, path, code: failure.code }, 'file not saved');
  return { outcome: 'failed', error: failure };
}

/** Whether a save has nothing to send: no change, and nothing asked for (S-226). */
function nothingToSend(doc: FileDocument, options: SaveOptions): boolean {
  const changingEncoding = options.encoding !== undefined && options.encoding !== doc.encoding;
  return !isDirty(doc) && !changingEncoding && options.overwrite === undefined && !doc.deleted;
}

/** The file to save, when there is something to save — an auto-save leaves a pending question alone. */
function toSave(doc: FileDocument | undefined, options: SaveOptions): FileDocument | null {
  if (
    doc === undefined ||
    doc.model === null ||
    doc.status !== 'ready' ||
    nothingToSend(doc, options)
  ) {
    return null;
  }

  const waits = needsAnswer(doc) || sensitiveSubject(doc.path) !== null;
  return options.automatic === true && waits ? null : doc;
}

/** The question a save asks before it writes — "recreate it?", the second step — or `null`. */
function questionFirst(doc: FileDocument, options: SaveOptions): Partial<FileDocument> | null {
  // Deleted on disk: a save offers to recreate it, never a silent `PUT` (S-240).
  if (doc.deleted) {
    return { recreateAsked: true };
  }

  return sensitiveSubject(doc.path) !== null && options.confirmSensitive !== true
    ? { sensitiveAsked: true }
    : null;
}

/** The text a save writes: the buffer, with the adjustments that are on applied to it first (S-237). */
function adjusted(model: TextModel): string {
  model.setValue(
    adjustForSave(model.getValue(), model.eol(), useEditorPreferences.getState().preferences),
  );
  return model.getValue();
}

/** The save itself, once it is this file's turn. */
async function saveNow(folder: string, path: string, options: SaveOptions): Promise<SaveResult> {
  const store = editorStoreOf(folder);
  const doc = toSave(store.getState().docs[path], options);

  if (doc?.model === undefined || doc.model === null) {
    return { outcome: 'unchanged' };
  }

  const question = questionFirst(doc, options);

  if (question !== null) {
    updateDoc(store, path, () => question);
    return { outcome: 'asked' };
  }

  const content = adjusted(doc.model);
  const version = doc.model.version();
  const encoding = options.encoding ?? doc.encoding;
  updateDoc(store, path, () => ({ saving: true, saveError: null, sensitiveAsked: false }));
  logger.info({ op: 'editor.save', folder, path }, 'file saving');

  try {
    const written = await saveFile({
      folder,
      path,
      content,
      etag: options.overwrite ?? doc.etag ?? '',
      encoding,
      bom: doc.bom,
      confirmSensitive: options.confirmSensitive === true,
    });

    return landed(
      folder,
      path,
      { etag: written.etag, version },
      { encoding, historyNotKept: written.historyNotKept },
    );
  } catch (error) {
    return refusedWith(folder, path, error);
  } finally {
    savedNow(folder, path);
  }
}

/**
 * Saves a file (B-34): with the version it was read as, one save at a time — a second one waits for
 * the first and goes with the version the first left (S-227).
 */
export function save(folder: string, path: string, options: SaveOptions = {}): Promise<SaveResult> {
  const key = `${folder}\n${path}`;
  const before = queues.get(key) ?? Promise.resolve<SaveResult>({ outcome: 'unchanged' });
  const next = before.then(() => saveNow(folder, path, options));

  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) {
      queues.delete(key);
    }
  });

  return next;
}

/** The auto-save: the same save, which never asks and leaves a file with a question alone. */
export function autoSave(folder: string, path: string): void {
  void save(folder, path, { automatic: true });
}

/** How a file that did not save is told in the report of "save all". */
function outcomeOf(path: string, result: SaveResult): SaveOutcome {
  if (result.outcome === 'failed') {
    return {
      path,
      saved: false,
      reasonKey: result.error.messageKey,
      params: { path, ...result.error.params },
    };
  }

  if (result.outcome === 'asked') {
    return { path, saved: false, reasonKey: 'editor.saveAll.needsAnswer', params: { path } };
  }

  return { path, saved: true, reasonKey: null, params: { path } };
}

/** "Save all" (Ctrl+K S): every dirty file of the folder, one by one, and how each went (S-234). */
export async function saveAll(folder: string): Promise<readonly SaveOutcome[]> {
  const store = editorStoreOf(folder);
  const dirty = Object.values(store.getState().docs)
    .filter(isDirty)
    .map((doc) => doc.path);
  const report: SaveOutcome[] = [];

  for (const path of dirty) {
    report.push(outcomeOf(path, await save(folder, path)));
  }

  store.setState({ saveReport: report });
  return report;
}

/** "Recreate it": the file deleted on disk is written again with the buffer — a create, never a `PUT`. */
export async function recreate(
  folder: string,
  path: string,
  confirmSensitive = false,
): Promise<SaveResult> {
  const open = withModel(folder, path);

  if (open === null) {
    return { outcome: 'unchanged' };
  }

  const { doc, model } = open;
  const version = model.version();
  updateDoc(editorStoreOf(folder), path, () => ({
    recreateAsked: false,
    saving: true,
    saveError: null,
  }));

  try {
    const written = await createFile({
      folder,
      path,
      content: model.getValue(),
      encoding: doc.encoding,
      bom: doc.bom,
      confirmSensitive,
    });

    return landed(folder, path, { etag: written.etag, version }, { deleted: false });
  } catch (error) {
    return refusedWith(folder, path, error);
  }
}

/** What "Save as" is told besides the paths. */
export interface SaveAsOptions {
  /** The version of the file at the new path, which the person chose to replace (S-233). */
  readonly replace?: string | null;
  readonly confirmSensitive?: boolean;
}

/** Writes the buffer at the new path: a create — or, replacing what is there, a save over its version. */
function writeAt(
  folder: string,
  doc: FileDocument,
  to: string,
  content: string,
  options: SaveAsOptions,
) {
  const write = {
    folder,
    path: to,
    content,
    encoding: doc.encoding,
    bom: doc.bom,
    confirmSensitive: options.confirmSensitive === true,
  };

  return typeof options.replace === 'string'
    ? saveFile({ ...write, etag: options.replace })
    : createFile(write);
}

/**
 * "Save as" (S-233): the buffer written at another path of the folder — never over a file that is
 * there unless the person said to replace it, and then over the version they were shown. The tab
 * follows the file to its new path; the old file stays on disk as it was.
 */
export async function saveAs(
  folder: string,
  from: string,
  to: string,
  options: SaveAsOptions = {},
): Promise<SaveResult> {
  const store = editorStoreOf(folder);
  const open = withModel(folder, from);

  if (open === null) {
    return { outcome: 'unchanged' };
  }

  const version = open.model.version();

  try {
    const written = await writeAt(folder, open.doc, to, open.model.getValue(), options);

    moveSaved(folder, from, to);
    store.setState({ saveAs: null });
    return landed(folder, to, { etag: written.etag, version }, { deleted: false, saveError: null });
  } catch (error) {
    const failure = asAppError(error);
    const etag = failure.params['currentEtag'];

    store.setState({
      saveAs:
        failure.code === 'FILE_EXISTS'
          ? {
              path: from,
              taken: { path: to, etag: typeof etag === 'string' ? etag : null },
              failure: null,
            }
          : { path: from, taken: null, failure },
    });
    return failure.code === 'FILE_EXISTS'
      ? { outcome: 'asked' }
      : { outcome: 'failed', error: failure };
  }
}

/**
 * "Save" of the close question: every file it listed is saved, and the tabs close only when all
 * were — a conflict or a second step stops the closing, and says why in its own question.
 */
export async function saveAndClose(folder: string): Promise<void> {
  const store = editorStoreOf(folder);
  const closing = store.getState().closing;

  if (closing === null) {
    return;
  }

  store.setState({ closing: null });
  const results = [];

  for (const path of closing.dirty) {
    results.push(await save(folder, path));
  }

  if (results.every((result) => result.outcome === 'saved' || result.outcome === 'unchanged')) {
    closeNow(folder, closing.group, closing.tabs);
  }
}

/**
 * "New file" of the empty editor (S-266): an empty file made at a path of the folder — never over
 * one that is there — and opened.
 *
 * @throws {AppError} as the server answered — `409` `FILE_EXISTS`, an invalid path — for the dialog
 */
export async function createAndOpen(folder: string, path: string): Promise<void> {
  await createFile({
    folder,
    path,
    content: '',
    encoding: 'utf8',
    bom: false,
    confirmSensitive: sensitiveSubject(path) !== null,
  });
  openFile(folder, path);
}
