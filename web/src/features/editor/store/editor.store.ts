import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import type { AppError } from '@/shared/api/errors';
import { emptyLayout } from '../lib/layout';
import type { Layout } from '../lib/layout';
import { languageOf } from '../lib/languages';
import type { ClosedTab, FileDocument, SaveOutcome } from '../types/editor';
import type { PdfReaderMemory } from '../types/pdf';

/** Tabs whose closing waits on a question: some of them have unsaved changes (S-210). */
export interface CloseRequest {
  readonly group: string;
  readonly tabs: readonly string[];

  /** The files that closing them would lose — the ones the question lists. */
  readonly dirty: readonly string[];
}

/** "Save as" being asked: of which file, and — once the path was taken — what is there (S-233). */
export interface SaveAsRequest {
  readonly path: string;

  /** The path a `409` answered for, and the version there, which a replace saves over. */
  readonly taken: { readonly path: string; readonly etag: string | null } | null;

  /** Why the last try did not save, said in the dialog. */
  readonly failure: AppError | null;
}

/** Something said to a screen reader — and on screen — once (S-277). */
export interface Announcement {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;

  /** Makes the same message said twice two announcements. */
  readonly at: number;
}

/**
 * The editor of **one** folder tab: its groups and tabs, its open files, the files it opened last,
 * and the questions it is asking.
 *
 * One store per folder, by its real path — never one for "the folder on screen"
 * (docs/architecture/web/04-state-and-data.md#o-explorer-e-o-editor-dentro-da-aba): `/r/app` and
 * `/r/app/pkg` open side by side share nothing, not even when they have the same file open (S-12).
 */
export interface EditorState extends Layout {
  readonly docs: Readonly<Record<string, FileDocument>>;

  /** The files opened last, newest first — "Open recent" of the File menu (S-219). */
  readonly recent: readonly string[];

  /** The tabs closed last, newest last — "Reopen closed" (S-212). */
  readonly closed: readonly ClosedTab[];
  readonly closing: CloseRequest | null;
  readonly saveAs: SaveAsRequest | null;

  /** How the last "save all" went, file by file, until it is dismissed (S-234). */
  readonly saveReport: readonly SaveOutcome[] | null;
  readonly announcement: Announcement | null;

  /** What the PDF reader of each editor tab remembers, by the tab's id — in memory (21 · D-06). */
  readonly readers: Readonly<Record<string, PdfReaderMemory>>;
}

export type EditorStore = StoreApi<EditorState>;

/** How many files "Open recent" remembers. */
export const RECENT_FILES = 10;

/** How many closed tabs "Reopen closed" remembers. */
export const CLOSED_TABS = 20;

/** A file not read yet. */
export function aDocument(path: string): FileDocument {
  return {
    path,
    status: 'idle',
    failure: null,
    etag: null,
    encoding: 'utf8',
    bom: false,
    readEol: 'lf',
    size: 0,
    light: false,
    model: null,
    pending: null,
    language: languageOf(path),
    indentation: null,
    version: 0,
    savedVersion: 0,
    saving: false,
    conflict: null,
    saveError: null,
    sensitiveAsked: false,
    historyNotKept: null,
    external: null,
    deleted: false,
    recreateAsked: false,
    cursor: { line: 1, column: 1 },
    selectionLength: 0,
    scrollTop: 0,
  };
}

/** Whether a file's buffer has changes the disk does not. */
export function isDirty(doc: FileDocument | undefined): boolean {
  return doc !== undefined && doc.model !== null && doc.version !== doc.savedVersion;
}

function emptyState(): EditorState {
  return {
    ...emptyLayout(),
    docs: {},
    recent: [],
    closed: [],
    closing: null,
    saveAs: null,
    saveReport: null,
    announcement: null,
    readers: {},
  };
}

const stores = new Map<string, EditorStore>();

/** Told whenever a folder's editor store is made — a reload restorer subscribes to the new one. */
const made = new Set<(folder: string) => void>();

/** The editor of a folder tab, made the first time it is asked for. */
export function editorStoreOf(folder: string): EditorStore {
  const existing = stores.get(folder);

  if (existing !== undefined) {
    return existing;
  }

  const created = createStore<EditorState>(emptyState);
  stores.set(folder, created);

  for (const listener of made) {
    listener(folder);
  }

  return created;
}

/** The folders whose editor is in memory — whether a page with unsaved work may unload (S-261). */
export function editorFolders(): readonly string[] {
  return [...stores.keys()];
}

/** Whether a folder's editor was made — asking must not make one. */
export function hasEditorStore(folder: string): boolean {
  return stores.has(folder);
}

/** Told whenever a folder's editor store is made. Answers the way to stop. */
export function onEditorStoreMade(listener: (folder: string) => void): () => void {
  made.add(listener);
  return () => {
    made.delete(listener);
  };
}

/** Changes one open file, when it is still open. */
export function updateDoc(
  store: EditorStore,
  path: string,
  change: (doc: FileDocument) => Partial<FileDocument>,
): void {
  store.setState((state) => {
    const doc = state.docs[path];
    return doc === undefined ? {} : { docs: { ...state.docs, [path]: { ...doc, ...change(doc) } } };
  });
}

/**
 * Lets go of a folder's editor — its tab closed — or of every one (`null`: a sign-out, a reload):
 * the texts are disposed of, and nothing of them stays anywhere (07 · D-14).
 */
export function forgetEditor(folder: string | null): void {
  const folders = folder === null ? [...stores.keys()] : [folder];

  for (const each of folders) {
    const store = stores.get(each);

    for (const doc of Object.values(store?.getState().docs ?? {})) {
      doc.model?.dispose();
    }

    stores.delete(each);
  }
}
