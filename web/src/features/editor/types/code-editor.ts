import type { TextRange } from '@/shared/lib/files-drag';

/** How the lines of a text end. A file whose lines end both ways is opened as `lf` and said `mixed`. */
export type LineEnding = 'lf' | 'crlf';

/** A place in a text, 1-based, as an editor reports its cursor. */
export interface TextPosition {
  readonly line: number;
  readonly column: number;
}

/** The theme an editor draws with — the app's two (docs/architecture/web/03-ui-system.md#tema). */
export type EditorTheme = 'light' | 'dark';

/** What a text starts as. */
export interface TextModelInit {
  readonly content: string;
  readonly eol: LineEnding;
  readonly language: string;
}

/**
 * The text of one open file — **one** per file per folder tab, whatever number of views show it: the
 * same file in two groups is one buffer, edited in one and dirty in both (plan 07, B-33).
 *
 * Its version is the editor's *alternative* version: undoing back to a state gives that state's
 * version again, so "is it dirty" is "is the version the one that was saved", and typing then undoing
 * back is clean, as in the editor people know.
 */
export interface TextModel {
  getValue(): string;

  /** Replaces the whole text as one edit that can be undone — a conversion, a save adjustment. */
  setValue(text: string): void;

  /** Replaces the whole text with what the disk has, and forgets the undo history (B-36). */
  reload(text: string): void;
  version(): number;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  eol(): LineEnding;

  /** Converts every line ending — an edit, which dirties the file (S-248). */
  setEol(eol: LineEnding): void;
  language(): string;
  setLanguage(language: string): void;

  /** Told after every change of the text or of the version. Answers the way to stop. */
  onDidChange(listener: () => void): () => void;
  dispose(): void;
}

/** What a view shows a text with — the preferences, and what the file asks for. */
export interface ViewOptions {
  /** The accessible name of the editor — translated ("Editor of main.ts"). */
  readonly label: string;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly tabSize: number;
  readonly insertSpaces: boolean;
  readonly wordWrap: boolean;
  readonly minimap: boolean;
  readonly readOnly: boolean;

  /**
   * The light mode of a large file (07 · D-04): no minimap, no folding, no heavy highlighting —
   * whatever the preferences say.
   */
  readonly light: boolean;
}

/** An action of the menu a selection opens in the editor — "Add selection to chat" (B-42). */
export interface ContextAction {
  readonly id: string;

  /** Translated. */
  readonly label: string;
  run(): void;
}

/** What a view can do besides showing and editing — the simplified mode cannot find or go to a line. */
export interface ViewCapabilities {
  readonly find: boolean;
  readonly goToLine: boolean;
}

/** One view of a text: the editor of one tab of one group. */
export interface CodeView {
  readonly capabilities: ViewCapabilities;

  /** Shows a text — `null` shows nothing. The view never disposes of a model it was given. */
  setModel(model: TextModel | null): void;
  focus(): void;
  position(): TextPosition;
  setPosition(position: TextPosition): void;

  /** The selection, or `null` when it is empty. */
  selection(): TextRange | null;

  /** How many characters are selected. */
  selectionLength(): number;
  scrollTop(): number;
  setScrollTop(top: number): void;
  update(options: ViewOptions): void;

  /** Told when the cursor or the selection moves. Answers the way to stop. */
  onCursorChange(listener: () => void): () => void;

  /** Told when the view loses the focus — the auto-save "on focus change" (S-236). */
  onBlur(listener: () => void): () => void;

  /** Opens the editor's own find — with the replace field when `replace`. */
  find(replace: boolean): void;

  /** Opens the editor's own "go to line" (B-36). */
  goToLine(): void;

  /**
   * Binds a key inside the editor to `run` — a sequence like `Mod+K S` that the editor would
   * otherwise keep for itself. Answers the way to stop.
   */
  bindKey(key: string, run: () => void): () => void;

  /** Puts an action in the menu of the editor. Answers the way to take it out. */
  addContextAction(action: ContextAction): () => void;
  dispose(): void;
}

/** One read-only diff of two texts — the diff tab (B-38). */
export interface CodeDiffView {
  update(options: ViewOptions): void;
  dispose(): void;
}

/** The two sides of a diff, and what they are called on screen. */
export interface DiffContent {
  readonly original: string;
  readonly modified: string;
  readonly language: string;

  /** Translated — what each side is ("On disk", "Your changes"). */
  readonly originalLabel: string;
  readonly modifiedLabel: string;
}

/**
 * The port `CodeEditor` (07 · D-09): what the rest of the feature knows of an editor.
 *
 * Two adapters honour it: the editor of the desktop (Monaco, loaded on demand, its own chunk) and
 * the simplified mode below `md` — a text area with the same save rules. Components and hooks are
 * tested in jsdom against the second, and a contract test holds both to the same behaviour
 * (S-208); Monaco itself is exercised end to end.
 */
export interface CodeEditorEngine {
  /** Which adapter — a model made by one is not shown by the other. */
  readonly kind: 'monaco' | 'plain';
  createModel(init: TextModelInit): TextModel;
  createView(host: HTMLElement, options: ViewOptions): CodeView;
  createDiffView(host: HTMLElement, content: DiffContent, options: ViewOptions): CodeDiffView;
  setTheme(theme: EditorTheme): void;

  /**
   * The text of a block of code, coloured as the editor colours its language — HTML whose every
   * character of the text is escaped (plan 08, D-04). Absent on an engine that colours nothing.
   */
  colorize?(code: string, language: string): Promise<string>;
}
