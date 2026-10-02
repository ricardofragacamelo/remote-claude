import type { AppError } from '@/shared/api/errors';
import type { FolderChange } from '@/shared/api/folder-watches';
import type { LineEnding, TextModel, TextPosition } from './code-editor';

/**
 * Where one side of a diff comes from: the file as it is on disk, the buffer of its editor, or a
 * version the local history kept (07 · F8).
 */
export interface DiffSide {
  /** Relative to the folder, POSIX. */
  readonly path: string;
  readonly source: 'disk' | 'buffer' | 'history';

  /** For `history`: the version shown, and when it was kept. */
  readonly version?: { readonly entryId: string; readonly at: string };
}

export interface OpenFileOptions {
  /** Opens as the preview tab (italic), replaced by the next preview — a single click in the tree. */
  readonly preview?: boolean;

  /** Opens in the group to the side, making it when there is none ("Open to the side"). */
  readonly toSide?: boolean;

  /** Puts the cursor on this line, counted from 1 — a path with `:line` in Claude's answer (plan 08). */
  readonly line?: number;
}

/** An editor tab of a file. */
export interface FileTab {
  readonly id: string;
  readonly kind: 'file';

  /** Relative to the folder, POSIX. */
  readonly path: string;

  /** The preview tab: italic, and replaced by the next preview until it is edited or pinned (S-209). */
  readonly preview: boolean;
  readonly pinned: boolean;
}

/** A read-only diff tab of two sides (B-38). */
export interface DiffTab {
  readonly id: string;
  readonly kind: 'diff';
  readonly left: DiffSide;
  readonly right: DiffSide;
  readonly preview: false;
  readonly pinned: boolean;
}

/**
 * A rendered preview of a file (B-50): markdown, an image, an SVG, a PDF — or an HTML file, shown as
 * its source and never as a page (07 · D-18). A text kind follows the file's buffer, unsaved changes
 * included (S-312).
 */
export interface PreviewTab {
  readonly id: string;
  readonly kind: 'preview';

  /** Relative to the folder, POSIX. */
  readonly path: string;

  /** Opened by a single click — replaced by the next preview, as a file tab is (S-209). */
  readonly preview: boolean;
  readonly pinned: boolean;
}

export type EditorTab = FileTab | DiffTab | PreviewTab;

/** The tabs that show one file: its editor, or its preview. */
export type PathTab = FileTab | PreviewTab;

/** A group of tabs, side by side with the others (B-33). */
export interface EditorGroup {
  readonly id: string;
  readonly tabs: readonly EditorTab[];

  /** The id of the tab on screen in the group. */
  readonly active: string | null;
}

/** How the lines of a file ended when it was read — both ways is `mixed`. */
export type ReadLineEnding = LineEnding | 'mixed';

/** Who changed a file on disk, as far as the server could tell — a label, never a decision. */
export type ChangeOrigin = NonNullable<FolderChange['origin']>;

/** The indentation a file is edited with. */
export interface Indentation {
  readonly insertSpaces: boolean;
  readonly size: number;
}

/**
 * One open file of a folder tab: its version on disk, its buffer, and what is happening to it.
 *
 * Lives **in memory only** — never in the browser's storage (07 · D-14): what a reload gives back of
 * the editor is paths, never content.
 */
export interface FileDocument {
  /** Relative to the folder, POSIX. */
  readonly path: string;
  readonly status: 'idle' | 'loading' | 'ready' | 'failed';

  /** Why it did not open — binary, too large, refused, not there (B-38). */
  readonly failure: AppError | null;

  /** The version on disk this buffer was read from or last saved as — `null` before it was read. */
  readonly etag: string | null;
  readonly encoding: string;
  readonly bom: boolean;
  readonly readEol: ReadLineEnding;
  readonly size: number;

  /** Between the large-file threshold and the editing ceiling: the light mode (07 · D-04, S-255). */
  readonly light: boolean;

  /** The text, once an editor made it; until then the content read waits in `pending`. */
  readonly model: TextModel | null;
  readonly pending: string | null;

  /** The language of the text — what highlights it, changeable by hand (S-251). */
  readonly language: string;
  readonly indentation: Indentation | null;

  /** The model's version now, and the one on disk: different means dirty. */
  readonly version: number;
  readonly savedVersion: number;
  readonly saving: boolean;

  /**
   * A save answered `412`: the disk has another version (S-228) — `null` etag: it was deleted. The
   * question is asked in a dialog; dismissed, it stays said above the editor until answered.
   */
  readonly conflict: { readonly currentEtag: string | null; readonly asking: boolean } | null;

  /** Why the last save failed, while the buffer stays dirty (S-230). */
  readonly saveError: AppError | null;

  /** The second step of a file that changes what Claude may do is being asked (S-232). */
  readonly sensitiveAsked: boolean;

  /**
   * The last save went through, but the version it replaced was not kept in the local history —
   * and why (07 · B-57, S-336). Said above the editor; it never stops a save.
   */
  readonly historyNotKept: 'tooLarge' | 'unavailable' | null;

  /** The disk changed under a dirty buffer: the non-blocking warning, and who did it (S-239). */
  readonly external: { readonly origin: ChangeOrigin | null } | null;

  /** Deleted on disk while open: the tab says so, and a save offers to recreate (S-240). */
  readonly deleted: boolean;
  readonly recreateAsked: boolean;
  readonly cursor: TextPosition;
  readonly selectionLength: number;
  readonly scrollTop: number;
}

/** What a tab closed, for "reopen closed" (S-212). */
export interface ClosedTab {
  readonly tab: EditorTab;
  readonly group: string;
}

/** How "save all" went for one file (S-234). */
export interface SaveOutcome {
  readonly path: string;
  readonly saved: boolean;

  /** The translation key of why not — named in full where it is decided. */
  readonly reasonKey: string | null;
  readonly params: Readonly<Record<string, unknown>>;
}

/** When the editor saves by itself (S-236). Off by default. */
export const AUTO_SAVE_MODES = ['off', 'afterDelay', 'onFocusChange'] as const;

export type AutoSave = (typeof AUTO_SAVE_MODES)[number];

/** The fonts the editor offers: the app's code font, or the browser's monospace. */
export const EDITOR_FONTS = ['code', 'browser'] as const;

export type EditorFont = (typeof EDITOR_FONTS)[number];

/** The preferences of the editor, for every tab (B-39). */
export interface EditorPreferences {
  readonly font: EditorFont;
  readonly fontSize: number;

  /** In percent of the font size. */
  readonly zoom: number;
  readonly tabSize: number;
  readonly insertSpaces: boolean;
  readonly wordWrap: boolean;
  readonly minimap: boolean;
  readonly autoSave: AutoSave;
  readonly trimTrailingWhitespace: boolean;
  readonly insertFinalNewline: boolean;
}
