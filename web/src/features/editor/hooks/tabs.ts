import { logger } from '@/shared/logging/logger';
import {
  aDiffTab,
  aFileTab,
  aPreviewTab,
  activeGroupOf,
  activeTabOf,
  isShown,
  mapTabs,
  movedAcross,
  movedTo,
  fileTabId,
  openIn,
  previewTabId,
  withoutTabs,
} from '../lib/layout';
import { retarget } from '../lib/paths';
import { opensAsPreview, previewsText } from '../lib/preview-kinds';
import {
  CLOSED_TABS,
  RECENT_FILES,
  aDocument,
  editorStoreOf,
  isDirty,
  updateDoc,
} from '../store/editor.store';
import type { EditorState, EditorStore } from '../store/editor.store';
import type {
  DiffSide,
  EditorGroup,
  EditorTab,
  FileDocument,
  OpenFileOptions,
  PathTab,
} from '../types/editor';
import { ensureLoaded, letGoOf } from './documents';
import { activeView } from './views';

/** The newest first, each once, at most `RECENT_FILES`. */
function withRecent(recent: readonly string[], path: string): readonly string[] {
  return [path, ...recent.filter((each) => each !== path)].slice(0, RECENT_FILES);
}

/**
 * Opens a file in an editor tab of the folder's tab — or brings the tab that has it to the front
 * (S-214): as a preview from a single click (S-209), to the side for "Open to the side" (S-221). An
 * image or a PDF opens as its picture (B-50): it has no text to edit, and its hexadecimal view is the
 * toggle of its tab.
 */
export function openFile(folder: string, path: string, options: OpenFileOptions = {}): void {
  if (opensAsPreview(path)) {
    openPreview(folder, path, options);
  } else {
    openEditorOf(folder, path, options);
  }
}

/** The open files with `path` among them — read when a tab shows it. */
function withDocument(
  docs: Readonly<Record<string, FileDocument>>,
  path: string,
): Readonly<Record<string, FileDocument>> {
  return docs[path] === undefined ? { ...docs, [path]: aDocument(path) } : docs;
}

/** Puts a tab of one file on screen, in the group with the focus or the one beside it. */
function openTab(folder: string, tab: PathTab, toSide: boolean, keepsText: boolean): void {
  editorStoreOf(folder).setState((state) => ({
    ...openIn(state, tab, toSide),
    docs: keepsText ? withDocument(state.docs, tab.path) : state.docs,
    recent: withRecent(state.recent, tab.path),
  }));
}

/** Opens a file's editor tab, whatever the file is — a binary one shows its hexadecimal view. */
function openEditorOf(folder: string, path: string, options: OpenFileOptions = {}): void {
  openTab(folder, aFileTab(path, options.preview === true), options.toSide === true, true);
  logger.debug(
    { op: 'editor.open', folder, path, line: options.line },
    'file opened in the editor',
  );

  if (options.line !== undefined) {
    atLine(folder, path, options.line);
  }

  void ensureLoaded(folder, path);
}

/**
 * Puts the cursor of a file on a line: in its document, which a view shows it from when it mounts,
 * and in the view already on screen when there is one (plan 08, B-16).
 */
function atLine(folder: string, path: string, line: number): void {
  const position = { line: Math.max(1, Math.floor(line)), column: 1 };

  updateDoc(editorStoreOf(folder), path, () => ({ cursor: position }));
  if (activeFile(folder) === path) {
    activeView(folder)?.setPosition(position);
  }
}

/**
 * Opens the rendered preview of a file (B-50) — "Open preview", and "Open preview to the side" with
 * `toSide`. A text kind is read like the editor reads it, into the same buffer: the preview follows
 * what is typed, unsaved (S-312).
 */
export function openPreview(folder: string, path: string, options: OpenFileOptions = {}): void {
  const text = previewsText(path);

  openTab(folder, aPreviewTab(path, options.preview === true), options.toSide === true, text);
  logger.debug({ op: 'editor.preview', folder, path }, 'file opened in a preview');

  if (text) {
    void ensureLoaded(folder, path);
  }
}

/** The other face of a tab: the editor of a preview, the preview of an editor. */
function otherFaceOf(tab: PathTab): PathTab {
  return tab.kind === 'file'
    ? { ...aPreviewTab(tab.path, tab.preview), pinned: tab.pinned }
    : { ...aFileTab(tab.path, tab.preview), pinned: tab.pinned };
}

/**
 * The toggle of a tab between the file's editor and its preview, in its place (B-50) — or, when the
 * group shows the other face already, that one brought to the front.
 */
export function togglePreview(folder: string, group: string, id: string): void {
  const store = editorStoreOf(folder);
  const tab = store
    .getState()
    .groups.find((each) => each.id === group)
    ?.tabs.find((each): each is PathTab => each.id === id && each.kind !== 'diff');

  if (tab === undefined) {
    return;
  }

  const other = otherFaceOf(tab);
  const faced = (each: EditorGroup): EditorGroup => {
    const shown = each.tabs.some((candidate) => candidate.id === other.id);
    const tabs = shown ? each.tabs : each.tabs.map((one) => (one === tab ? other : one));
    return { ...each, tabs, active: other.id };
  };

  store.setState((state) => ({
    groups: state.groups.map((each) => (each.id === group ? faced(each) : each)),
    docs:
      other.kind === 'file' || previewsText(tab.path)
        ? withDocument(state.docs, tab.path)
        : state.docs,
  }));

  void ensureLoaded(folder, tab.path);
  dropUnshown(folder, store);
}

/** Opens a read-only diff tab of two sides — the conflict, "Compare selected", "Compare with saved". */
export function openDiff(folder: string, left: DiffSide, right: DiffSide): void {
  const store = editorStoreOf(folder);

  store.setState((state) => ({ ...openIn(state, aDiffTab(left, right), false) }));
}

/** The file of the active tab of the group with the focus — `null` for none, or for a diff. */
export function activeFileOf(state: EditorState): string | null {
  const tab = activeTabOf(activeGroupOf(state));
  return tab?.kind === 'file' ? tab.path : null;
}

/** The file of the active editor tab of `folder` — what "Reveal in explorer" reveals. */
export function activeFile(folder: string): string | null {
  return activeFileOf(editorStoreOf(folder).getState());
}

/**
 * The files open in the editor, the active one first, then the ones opened last — what an `@` of
 * Claude's panel offers first (plan 08, B-48). Without repeats, in that order.
 */
export function openAndRecentFiles(folder: string): readonly string[] {
  const state = editorStoreOf(folder).getState();
  const active = activeFileOf(state);
  const open = state.groups.flatMap((group) =>
    group.tabs.flatMap((tab) => (tab.kind === 'file' ? [tab.path] : [])),
  );

  return [...new Set([...(active === null ? [] : [active]), ...open, ...state.recent])];
}

/** Puts a tab of a group on screen, and the focus in that group. */
export function activateTab(folder: string, group: string, id: string): void {
  editorStoreOf(folder).setState((state) => ({
    activeGroup: group,
    groups: state.groups.map((each) => (each.id === group ? { ...each, active: id } : each)),
  }));
}

/** The focus to another group — by its id, or `±1` from the one that has it (S-268). */
export function focusGroup(folder: string, to: string | -1 | 1): void {
  const store = editorStoreOf(folder);
  const { groups, activeGroup } = store.getState();
  const at = groups.findIndex((group) => group.id === activeGroup);
  const target =
    typeof to === 'string'
      ? groups.find((group) => group.id === to)
      : groups[(at + to + groups.length) % groups.length];

  if (target !== undefined) {
    store.setState({ activeGroup: target.id });
  }
}

/** Pins a tab, or unpins it: a pinned tab stays at the left, and "close others" leaves it (S-213). */
export function setPinned(folder: string, group: string, id: string, pinned: boolean): void {
  const store = editorStoreOf(folder);
  const only = (state: EditorState): EditorState => ({
    ...state,
    groups: state.groups.filter((each) => each.id === group),
  });

  store.setState((state) => {
    const [changed] = mapTabs(
      only(state),
      (tab) => tab.id === id,
      (tab) => ({ ...tab, pinned, preview: false }) as EditorTab,
    ).groups;

    return {
      groups: state.groups.map((each) =>
        each.id === group && changed !== undefined ? changed : each,
      ),
    };
  });
}

/** A double click on a preview tab keeps it (S-209). */
export function keepPreview(folder: string, group: string, id: string): void {
  const store = editorStoreOf(folder);

  store.setState((state) => ({
    groups: state.groups.map((each) =>
      each.id === group
        ? {
            ...each,
            tabs: each.tabs.map((tab) =>
              tab.id === id && tab.kind !== 'diff' ? { ...tab, preview: false } : tab,
            ),
          }
        : each,
    ),
  }));
}

/** Moves a tab inside its group — to an index (a drag), or one place (`Alt+Shift+←/→`, S-213). */
export function moveTab(
  folder: string,
  group: string,
  id: string,
  to: { by: -1 | 1 } | { index: number },
): void {
  editorStoreOf(folder).setState((state) => ({
    groups: state.groups.map((each) => {
      if (each.id !== group) {
        return each;
      }

      const index = 'index' in to ? to.index : each.tabs.findIndex((tab) => tab.id === id) + to.by;
      return movedTo(each, id, index);
    }),
  }));
}

/** Moves a tab into another group — a drag across (S-221). */
export function moveTabAcross(
  folder: string,
  from: string,
  id: string,
  to: string,
  index: number,
): void {
  editorStoreOf(folder).setState((state) => movedAcross(state, from, id, to, index));
}

/** The files closing `ids` of a group would lose: dirty, and shown by no other tab (S-210, S-222). */
export function lostBy(
  state: EditorState,
  group: string,
  ids: readonly string[],
): readonly string[] {
  const after = withoutTabs(state, group, ids);

  return Object.values(state.docs)
    .filter((doc) => isDirty(doc) && !isShown(after, doc.path))
    .map((doc) => doc.path);
}

/** Lets go of the files no tab shows any more — their texts are disposed of. */
function dropUnshown(folder: string, store: EditorStore): void {
  const state = store.getState();
  const gone = Object.values(state.docs).filter((doc) => !isShown(state, doc.path));

  if (gone.length === 0) {
    return;
  }

  for (const doc of gone) {
    letGoOf(folder, doc);
  }

  store.setState({
    docs: Object.fromEntries(Object.entries(state.docs).filter(([path]) => isShown(state, path))),
  });
}

/** Closes tabs, asking nothing — what "Don't save" and a clean close do. */
export function closeNow(folder: string, group: string, ids: readonly string[]): void {
  const store = editorStoreOf(folder);

  store.setState((state) => {
    const closing =
      state.groups.find((each) => each.id === group)?.tabs.filter((tab) => ids.includes(tab.id)) ??
      [];

    return {
      ...withoutTabs(state, group, ids),
      closing: null,
      closed: [...state.closed, ...closing.map((tab) => ({ tab, group }))].slice(-CLOSED_TABS),
    };
  });
  dropUnshown(folder, store);
}

/**
 * Asks to close tabs of a group: a clean tab closes (S-211); one whose file would lose unsaved changes
 * asks Save / Don't save / Cancel first (S-210).
 */
export function closeTabs(folder: string, group: string, ids: readonly string[]): void {
  const store = editorStoreOf(folder);
  const dirty = lostBy(store.getState(), group, ids);

  if (ids.length === 0) {
    return;
  }

  if (dirty.length === 0) {
    closeNow(folder, group, ids);
  } else {
    store.setState({ closing: { group, tabs: ids, dirty } });
  }
}

/** The tabs a "close …" of the tab menu closes — never a pinned one but the tab itself (S-212). */
export function tabsToClose(
  state: EditorState,
  group: string,
  id: string,
  which: 'others' | 'right' | 'saved' | 'all',
): readonly string[] {
  const tabs = state.groups.find((each) => each.id === group)?.tabs ?? [];
  const at = tabs.findIndex((tab) => tab.id === id);
  const unpinned = (tab: EditorTab): boolean => !tab.pinned;

  const picked: Record<typeof which, () => readonly EditorTab[]> = {
    others: () => tabs.filter((tab) => tab.id !== id && unpinned(tab)),
    right: () => tabs.slice(at + 1).filter(unpinned),
    saved: () =>
      tabs.filter(
        (tab) => unpinned(tab) && (tab.kind === 'diff' || !isDirty(state.docs[tab.path])),
      ),
    all: () => tabs.filter(unpinned),
  };

  return picked[which]().map((tab) => tab.id);
}

/** "Reopen closed tab" (`Ctrl+Shift+T`): the last one closed, in its group when it still is (S-212). */
export function reopenClosed(folder: string): void {
  const store = editorStoreOf(folder);
  const last = store.getState().closed.at(-1);

  if (last === undefined) {
    return;
  }

  store.setState((state) => ({
    closed: state.closed.slice(0, -1),
    activeGroup: state.groups.some((group) => group.id === last.group)
      ? last.group
      : state.activeGroup,
  }));

  if (last.tab.kind === 'diff') {
    openDiff(folder, last.tab.left, last.tab.right);
  } else if (last.tab.kind === 'preview') {
    openPreview(folder, last.tab.path);
  } else {
    openEditorOf(folder, last.tab.path);
  }
}

/** A side of a diff, followed to where its file moved. */
function movedSide(side: DiffSide, from: string, to: string): DiffSide {
  return { ...side, path: retarget(side.path, from, to) ?? side.path };
}

/** A tab, followed to where its file — or a directory above it — moved. */
function movedTab(tab: EditorTab, from: string, to: string): EditorTab {
  if (tab.kind === 'diff') {
    return aDiffTabMoved(tab.left, tab.right, tab.pinned, from, to);
  }

  const path = retarget(tab.path, from, to) ?? tab.path;
  return { ...tab, path, id: tab.kind === 'file' ? fileTabId(path) : previewTabId(path) };
}

function aDiffTabMoved(
  left: DiffSide,
  right: DiffSide,
  pinned: boolean,
  from: string,
  to: string,
): EditorTab {
  return { ...aDiffTab(movedSide(left, from, to), movedSide(right, from, to)), pinned };
}

/**
 * A file or a directory of the folder moved: every tab of it — or of anything under it — follows,
 * buffer, dirty state and version included. Nothing is read again.
 */
export function entryMoved(folder: string, from: string, to: string): void {
  const store = editorStoreOf(folder);

  store.setState((state) => {
    const docs: Record<string, FileDocument> = {};

    for (const [path, doc] of Object.entries(state.docs)) {
      const moved = retarget(path, from, to) ?? path;
      docs[moved] = moved === path ? doc : { ...doc, path: moved };
    }

    return {
      ...mapTabs(
        state,
        () => true,
        (tab) => movedTab(tab, from, to),
      ),
      docs,
      recent: state.recent.map((path) => retarget(path, from, to) ?? path),
      closed: state.closed.map((closed) => ({ ...closed, tab: movedTab(closed.tab, from, to) })),
    };
  });
}

/**
 * The tabs of a file saved at another path follow it there (S-233) — and a tab that had the new path
 * open closes first: one file, one buffer.
 */
export function moveSaved(folder: string, from: string, to: string): void {
  const store = editorStoreOf(folder);

  if (from === to) {
    return;
  }

  for (const group of store.getState().groups) {
    const shown = group.tabs
      .filter((tab) => tab.kind === 'file' && tab.path === to)
      .map((tab) => tab.id);
    closeNow(folder, group.id, shown);
  }

  // A diff still showing the old buffer of `to` kept it: the file at `to` is now the one saved.
  const replaced = store.getState().docs[to];

  if (replaced !== undefined) {
    letGoOf(folder, replaced);
    store.setState((state) => ({
      docs: Object.fromEntries(Object.entries(state.docs).filter(([path]) => path !== to)),
    }));
  }

  entryMoved(folder, from, to);
  store.setState((state) => ({ recent: withRecent(state.recent, to) }));
}

/** The question of closing dirty tabs, dismissed — nothing closes (S-210). */
export function cancelClose(folder: string): void {
  editorStoreOf(folder).setState({ closing: null });
}

/** "Don't save": the tabs close and their changes are dropped. */
export function discardAndClose(folder: string): void {
  const closing = editorStoreOf(folder).getState().closing;

  if (closing !== null) {
    closeNow(folder, closing.group, closing.tabs);
  }
}

/** "Save as" closed without saving. */
export function cancelSaveAs(folder: string): void {
  editorStoreOf(folder).setState({ saveAs: null });
}

/** The path of "Save as" changed: what was taken at the old one is no longer the question. */
export function forgetTaken(folder: string): void {
  editorStoreOf(folder).setState((state) =>
    state.saveAs === null || state.saveAs.taken === null
      ? {}
      : { saveAs: { ...state.saveAs, taken: null } },
  );
}

/** The report of "save all", read and put away. */
export function dismissSaveReport(folder: string): void {
  editorStoreOf(folder).setState({ saveReport: null });
}
