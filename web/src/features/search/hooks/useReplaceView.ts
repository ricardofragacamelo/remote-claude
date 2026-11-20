import { useStore } from 'zustand';

import { openDiff } from '@/features/editor';
import type { AppError } from '@/shared/api/errors';
import type { ApplyReplace } from './useApplyReplace';
import { useApplyReplace } from './useApplyReplace';
import { useReplacePreview } from './useReplacePreview';
import { useRetainedOnRefusal } from './retained-on-refusal';
import { baseQueryOf } from '../lib/query-fields';
import { replaceDiffSides } from '../lib/replace-diff-source';
import { copyAllOf, rowsOf } from '../lib/rows-and-copy';
import type { SearchRow } from '../lib/search-rows';
import type { SearchViewState } from '../store/search-view.store';
import { searchViewStore } from '../store/search-view.store';
import type {
  ReplaceApplyReport,
  ReplacePreviewFileResult,
  ReplacePreviewMatch,
  ReplaceQuery,
  SearchTruncation,
} from '../types/search';

/** The flags a replace request is built from, beside the search's own — the store's, read-only. */
type ReplaceViewFields = Pick<
  SearchViewState,
  | 'query'
  | 'isRegex'
  | 'caseSensitive'
  | 'wholeWord'
  | 'include'
  | 'exclude'
  | 'useIgnoreFiles'
  | 'replaceOpen'
  | 'replacement'
  | 'preserveCase'
>;

/** The preview's own request — `null` while the row is closed, or there is nothing typed yet. */
function replaceQueryOf(state: ReplaceViewFields): ReplaceQuery | null {
  if (!state.replaceOpen || state.query === '') {
    return null;
  }

  return {
    ...baseQueryOf(state),
    replacement: state.replacement,
    preserveCase: state.preserveCase,
  };
}

/** Nothing to report — asked to replace a file the preview no longer knows about. */
const EMPTY_REPORT: ReplaceApplyReport = { applied: [], changed: [], missing: [], skipped: [] };

/** What the replace row of the Search view reads and acts on (plan 11, B-16). */
export interface ReplaceView {
  readonly folder: string;
  readonly replaceOpen: boolean;
  readonly replacement: string;
  readonly preserveCase: boolean;
  setReplaceOpen(open: boolean): void;
  setReplacement(value: string): void;
  setPreserveCase(value: boolean): void;

  readonly rows: readonly SearchRow<ReplacePreviewMatch>[];

  /** Every file `replaceAll` would touch — a fully dismissed file never among them. */
  readonly files: readonly ReplacePreviewFileResult[];
  readonly fileCount: number;
  readonly resultCount: number;
  readonly isPreviewing: boolean;
  readonly error: AppError | null;
  readonly truncated: SearchTruncation;
  readonly skipped: number;

  /** The disk as it is, beside what it would become if `path` were replaced now (S-125). */
  openDiff(path: string): void;

  /** Replaces one file — the same call a match row's own action makes (S-128). */
  replaceFile(path: string): Promise<ReplaceApplyReport>;

  /** Replaces every file the preview found (S-124) — the scope is the caller's to show first. */
  replaceAll(): Promise<ReplaceApplyReport>;

  readonly isApplying: boolean;
  readonly report: ReplaceApplyReport | undefined;

  /** A real refusal of the apply itself — too many files named, or a write failed partway. */
  readonly applyError: AppError | null;
  dismissReport(): void;

  /** Clears the "preserved" files' staleness and asks the preview again (S-129). */
  redoPreview(): void;

  /** Collapses every file of the preview on screen — `expandAll`/`toggleCollapsed` need no mode of their own. */
  collapseAll(): void;

  /** Every result of the preview, as "Copy All" writes it — a dismissed row left out (S-118). */
  copyAllText(): string;
}

/**
 * The replace row of the Search view of one folder tab (plan 11, B-16): its own text and
 * "preserve case", the preview as a tree beside the search's own, and applying it — one file, or
 * every file the preview found. Everything is the tab's, the same as the search above it (S-121).
 */
export function useReplaceView(folder: string): ReplaceView {
  const store = searchViewStore(folder);
  const state = useStore(store);
  const request = replaceQueryOf(state);
  const preview = useReplacePreview(folder, request);
  const apply: ApplyReplace = useApplyReplace(folder);

  const files = useRetainedOnRefusal(preview.files, request !== null, preview.error !== null);
  const { rows, resultCount } = rowsOf(files, state);
  const visiblePaths = new Set(rows.filter((row) => row.kind === 'file').map((row) => row.path));
  // A whole file dismissed is never applied — a match dismissed is view-only: the engine finds
  // every occurrence of the pattern fresh at apply time, never a subset the tree happened to show
  // (the backend's own grain is the file, B-11), so only a fully-dismissed file is excluded here.
  const visibleFiles = files.filter((file) => visiblePaths.has(file.path));

  const applyTo = (
    query: ReplaceQuery,
    targets: readonly ReplacePreviewFileResult[],
  ): Promise<ReplaceApplyReport> =>
    apply.apply({ query, files: targets.map((file) => ({ path: file.path, etag: file.etag })) });

  return {
    folder,
    replaceOpen: state.replaceOpen,
    replacement: state.replacement,
    preserveCase: state.preserveCase,
    setReplaceOpen: store.getState().setReplaceOpen,
    setReplacement: store.getState().setReplacement,
    setPreserveCase: store.getState().setPreserveCase,

    rows,
    files: visibleFiles,
    fileCount: visibleFiles.length,
    resultCount,
    isPreviewing: preview.isPreviewing,
    error: preview.error,
    truncated: preview.truncated,
    skipped: preview.skipped,

    openDiff: (path) => {
      if (request === null) {
        return;
      }
      const sides = replaceDiffSides(path, request);
      openDiff(folder, sides.left, sides.right);
    },

    replaceFile: (path) => {
      const file = visibleFiles.find((each) => each.path === path);
      return request === null || file === undefined
        ? Promise.resolve(EMPTY_REPORT)
        : applyTo(request, [file]);
    },
    replaceAll: () =>
      request === null ? Promise.resolve(EMPTY_REPORT) : applyTo(request, visibleFiles),

    isApplying: apply.isApplying,
    report: apply.report,
    applyError: apply.error,
    dismissReport: apply.reset,

    redoPreview: () => {
      apply.reset();
      preview.reload();
    },

    collapseAll: () => {
      store.getState().collapseAll(visibleFiles.map((file) => file.path));
    },
    copyAllText: () => copyAllOf(files, state),
  };
}
