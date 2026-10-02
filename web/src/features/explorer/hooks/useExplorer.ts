import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { openDiff, openFile } from '@/features/editor';
import { useCopy } from '@/shared/hooks/useCopy';
import { useRegistry } from '@/shared/hooks/useRegistry';
import {
  addToClaudeContext,
  claudeContextTargets,
  filesDragPayload,
} from '@/shared/lib/files-drag';
import type { DragCandidate } from '@/shared/lib/files-drag';
import { duplicateName } from '../lib/duplicate-name';
import { absoluteOf, nameOf, parentOf } from '../lib/paths';
import { isOperable } from '../lib/sort';
import { templateOf } from '../lib/templates';
import type { EntryRow, TreeRow } from '../lib/tree-rows';
import { explorerStore } from '../store/explorer.store';
import type { ExplorerState } from '../store/explorer.store';
import type { NewEntryKind } from '../types/explorer';
import { copyInto, isTaken, moveInto, undoDeleted, undoLast } from './file-operations';
import type { FolderContext } from './file-operations';
import { useDeleteFlow } from './useDeleteFlow';
import type { DeleteFlow } from './useDeleteFlow';
import { useExplorerState } from './useExplorerState';
import { useExplorerTree } from './useExplorerTree';
import type { ExplorerTree } from './useExplorerTree';
import { useInlineName } from './useInlineName';
import type { InlineName } from './useInlineName';
import { useOperationRunner } from './useOutcome';
import { useTransfer } from './useTransfer';
import type { Transfer } from './useTransfer';
import type { OperationOn, OperationRunner } from './useOutcome';

/** The Explorer of one folder tab: its tree, what it can do, and the dialogs it may have open. */
export interface Explorer {
  readonly folder: string;
  readonly tree: ExplorerTree;
  readonly state: ExplorerState;

  /** What the actions act on, in the order of the tree: the selection, or the row the keyboard is on. */
  readonly targets: readonly EntryRow[];
  readonly name: InlineName;
  readonly runner: OperationRunner;
  readonly deletion: DeleteFlow;

  /** Files in and out of the machine: upload, download (plan 07 · B-52). */
  readonly transfer: Transfer;

  /** Entries waiting for "Move to…" to be given a folder — `null` with no dialog open. */
  readonly moving: readonly string[] | null;
  readonly choosingTemplate: boolean;
  readonly helpOpen: boolean;

  /** Whether somebody takes files into Claude's context — the panel of plan 08 (S-276). */
  readonly claudeTakesFiles: boolean;

  /** The folders the tree knows, for "Move to…" — the folder itself first. */
  knownFolders(): readonly string[];

  /** Where a new entry, or a paste, goes: the folder selected, or the folder of the file selected. */
  targetFolder(): string;
  open(row: TreeRow, options?: { readonly preview?: boolean }): void;
  newEntry(kind: NewEntryKind, template?: string | null): void;
  newFromFile(): void;
  rename(): void;
  remove(): void;
  copy(mode: 'copy' | 'cut'): void;
  paste(): void;
  duplicate(): void;
  askMove(): void;
  moveInto(paths: readonly string[], destination: string): void;
  cancelMove(): void;
  undo(): void;
  copyPath(absolute: boolean): void;
  openToSide(): void;
  compare(): void;
  addToContext(): void;
  refresh(): void;
  chooseTemplate(open: boolean): void;
  setHelpOpen(open: boolean): void;
}

/** The entries the actions act on: the selection in the order of the tree, or the focused row. */
export function targetsOf(
  rows: readonly TreeRow[],
  selection: readonly string[],
  focused: string | null,
): readonly EntryRow[] {
  const entries = rows.filter((row): row is EntryRow => row.type === 'entry');
  const selected = entries.filter((row) => selection.includes(row.path));

  if (selected.length > 0) {
    return selected;
  }

  return entries.filter((row) => row.key === focused);
}

/** The paths of the entries an action may act on — never a name that is not text (S-274). */
function operablePaths(targets: readonly EntryRow[]): readonly string[] {
  return targets.filter((row) => !row.entry.unreadableName).map((row) => row.path);
}

/** The folder a row stands for: itself when it opens, the folder it is in otherwise. */
function folderOf(row: EntryRow | undefined): string {
  if (row === undefined) {
    return '';
  }

  return row.expandable ? row.path : row.parent;
}

/** What an operation of many entries tells when it ends — the outcome dialog shows the failures. */
function batch(
  runner: OperationRunner,
  titleKey: string,
  paths: readonly string[],
  operation: OperationOn,
): void {
  if (paths.length > 0) {
    void runner.run(titleKey, paths, operation);
  }
}

/**
 * The Explorer of one folder tab — the tree and every function on its files (B-24…B-27), for the
 * view, its menus, its commands and its shortcuts to share: one place decides what "Delete" deletes,
 * whichever of the three the person used.
 */
export function useExplorer(folder: string): Explorer {
  const client = useQueryClient();
  const context = useMemo<FolderContext>(() => ({ folder, client }), [folder, client]);
  const tree = useExplorerTree(folder);
  const state = useExplorerState(folder);
  const runner = useOperationRunner();
  const name = useInlineName(context, runner);
  const transfer = useTransfer(context, runner);
  const deletion = useDeleteFlow(context, {
    finished: (results) => {
      if (results.some((result) => !result.ok)) {
        runner.show({ titleKey: 'explorer.outcome.deleteFailed', results, context: 'operation' });
      } else {
        explorerStore(folder)
          .getState()
          .announce('explorer.done.deleted', { count: results.length });
      }
    },
    askSensitive: runner.askSensitive,
    undo: (entries) => {
      void runner.run(
        'explorer.outcome.undoDeleteFailed',
        entries.map((entry) => entry.path),
        (paths, confirmSensitive) => undoDeleted(context, entries, paths, confirmSensitive),
        'undo',
      );
    },
  });
  const [moving, setMoving] = useState<readonly string[] | null>(null);
  const [choosingTemplate, chooseTemplate] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const copier = useCopy();
  const claudeTakesFiles = useRegistry(claudeContextTargets).length > 0;
  const targets = useMemo(
    () => targetsOf(tree.rows, state.selection, state.focused),
    [state.focused, state.selection, tree.rows],
  );

  useEffect(() => {
    if (copier.state !== 'idle') {
      explorerStore(folder)
        .getState()
        .announce(
          copier.state === 'copied' ? 'explorer.done.pathCopied' : 'explorer.done.copyFailed',
        );
    }
  }, [copier.state, folder]);

  const store = explorerStore(folder).getState;
  const paths = operablePaths(targets);
  const single = targets.length === 1 ? targets[0] : undefined;
  const targetFolder = useCallback(() => folderOf(targets[0]), [targets]);

  return {
    folder,
    tree,
    state,
    targets,
    name,
    runner,
    deletion,
    transfer,
    moving,
    choosingTemplate,
    helpOpen,
    claudeTakesFiles,
    knownFolders: () => knownFoldersOf(tree),
    targetFolder,
    open: (row, options = {}) => {
      openRow(folder, tree, row, options.preview === true);
    },
    newEntry: (kind, template = null) => {
      const suggested = template === null ? '' : (templateOf(template)?.suggestedName ?? '');
      store().startCreating({
        parent: targetFolder(),
        kind,
        initialName: suggested,
        template,
        source: null,
      });
    },
    newFromFile: () => {
      if (single?.entry.kind === 'file') {
        const parent = single.parent;
        store().startCreating({
          parent,
          kind: 'file',
          initialName: duplicateName(nameOf(single.path), (each) => isTaken(context, parent, each)),
          template: null,
          source: single.path,
        });
      }
    },
    rename: () => {
      if (single !== undefined && isOperable(single.entry)) {
        store().startRenaming(single.path);
      }
    },
    remove: () => {
      if (paths.length > 0) {
        deletion.ask(paths);
      }
    },
    copy: (mode) => {
      if (paths.length > 0) {
        store().setClipboard({ mode, paths });
        store().announce(mode === 'copy' ? 'explorer.done.copiedAside' : 'explorer.done.cutAside', {
          count: paths.length,
        });
      }
    },
    paste: () => {
      const clipboard = store().clipboard;
      const destination = targetFolder();

      if (clipboard === null) {
        return;
      }

      if (clipboard.mode === 'cut') {
        store().setClipboard(null);
      }

      batch(runner, 'explorer.outcome.pasteFailed', clipboard.paths, (some, confirmSensitive) =>
        clipboard.mode === 'cut'
          ? moveInto(context, some, destination, { confirmSensitive })
          : copyInto(context, some, () => destination, { confirmSensitive }),
      );
    },
    duplicate: () => {
      batch(runner, 'explorer.outcome.duplicateFailed', paths, (some, confirmSensitive) =>
        copyInto(context, some, parentOf, { confirmSensitive }),
      );
    },
    askMove: () => {
      if (paths.length > 0) {
        setMoving(paths);
      }
    },
    moveInto: (moved, destination) => {
      setMoving(null);
      batch(runner, 'explorer.outcome.moveFailed', moved, (some, confirmSensitive) =>
        moveInto(context, some, destination, { confirmSensitive }),
      );
    },
    cancelMove: () => {
      setMoving(null);
    },
    undo: () => {
      void runner.run('explorer.outcome.undoFailed', [], () => undoLast(context), 'undo');
    },
    copyPath: (absolute) => {
      if (paths.length > 0) {
        copier.copy(paths.map((path) => (absolute ? absoluteOf(folder, path) : path)).join('\n'));
      }
    },
    openToSide: () => {
      if (single?.entry.kind === 'file' && isOperable(single.entry)) {
        openFile(folder, single.path, { toSide: true });
      }
    },
    compare: () => {
      const [left, right] = targets;

      if (targets.length === 2 && left !== undefined && right !== undefined) {
        openDiff(folder, { path: left.path, source: 'disk' }, { path: right.path, source: 'disk' });
      }
    },
    addToContext: () => {
      addTargetsToContext(folder, targets);
    },
    refresh: () => {
      store().reload();
    },
    chooseTemplate,
    setHelpOpen,
  };
}

/** Opens a row: a file in the editor, a folder in the tree, a failed level read again. */
function openRow(folder: string, tree: ExplorerTree, row: TreeRow, preview: boolean): void {
  if (row.type === 'error') {
    tree.retry(row.parent);
    return;
  }

  if (row.type !== 'entry' || !isOperable(row.entry)) {
    return;
  }

  if (row.expandable) {
    explorerStore(folder).getState().toggle(row.head);
  } else if (row.entry.kind === 'file' || row.entry.targetKind === 'file') {
    openFile(folder, row.path, preview ? { preview } : {});
  }
}

/** Every folder the tree has read, the open folder first. */
function knownFoldersOf(tree: ExplorerTree): readonly string[] {
  const found = new Set<string>(['']);
  const visit = (path: string): void => {
    const state = tree.directory(path);

    if (state.status !== 'ready') {
      return;
    }

    for (const entry of state.listing.entries) {
      if (entry.kind === 'directory' && !entry.unreadableName) {
        found.add(entry.path);
        visit(entry.path);
      }
    }
  };

  visit('');
  return [...found];
}

/** "Add to Claude's context" — the same payload a drag carries, announced when it is taken (S-277). */
function addTargetsToContext(folder: string, targets: readonly EntryRow[]): void {
  const store = explorerStore(folder).getState();
  const candidates: DragCandidate[] = targets.map(candidateOf);
  const { payload, excluded } = filesDragPayload(folder, candidates);

  if (payload !== null && addToClaudeContext(payload)) {
    store.announce('explorer.context.added', { count: payload.entries.length });
  }

  if (excluded.length > 0) {
    store.announce('explorer.context.excluded', { count: excluded.length });
  }
}

/** A row as the drag and "Add to Claude's context" know it. */
export function candidateOf(row: EntryRow): DragCandidate {
  const inoperable = row.entry.unreadableName
    ? 'unreadableName'
    : row.entry.outside
      ? 'outsideLink'
      : undefined;

  return {
    path: row.path,
    kind: row.expandable ? 'directory' : 'file',
    ...(inoperable === undefined ? {} : { inoperable }),
  };
}
