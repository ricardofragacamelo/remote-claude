import * as monaco from 'monaco-editor/editor/editor.api';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// The editor's own behaviours — find and replace, go to line, multi-cursor, folding, the minimap,
// sticky scroll, the diff editor. No language service comes with them.
import 'monaco-editor/features/register.all';

// Highlighting only: a grammar per language, each loaded when a file of it opens. The language
// services of Monaco (`languages/features/*` — TypeScript, JSON, CSS, HTML workers) are left out on
// purpose: completion, diagnostics and the rest stay out by the user's decision (07 · D-09).
import 'monaco-editor/languages/definitions/bat/register';
import 'monaco-editor/languages/definitions/cpp/register';
import 'monaco-editor/languages/definitions/csharp/register';
import 'monaco-editor/languages/definitions/css/register';
import 'monaco-editor/languages/definitions/dart/register';
import 'monaco-editor/languages/definitions/dockerfile/register';
import 'monaco-editor/languages/definitions/go/register';
import 'monaco-editor/languages/definitions/graphql/register';
import 'monaco-editor/languages/definitions/html/register';
import 'monaco-editor/languages/definitions/ini/register';
import 'monaco-editor/languages/definitions/java/register';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/kotlin/register';
import 'monaco-editor/languages/definitions/less/register';
import 'monaco-editor/languages/definitions/lua/register';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/perl/register';
import 'monaco-editor/languages/definitions/php/register';
import 'monaco-editor/languages/definitions/powershell/register';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/languages/definitions/r/register';
import 'monaco-editor/languages/definitions/ruby/register';
import 'monaco-editor/languages/definitions/rust/register';
import 'monaco-editor/languages/definitions/scss/register';
import 'monaco-editor/languages/definitions/shell/register';
import 'monaco-editor/languages/definitions/sql/register';
import 'monaco-editor/languages/definitions/swift/register';
import 'monaco-editor/languages/definitions/typescript/register';
import 'monaco-editor/languages/definitions/xml/register';
import 'monaco-editor/languages/definitions/yaml/register';

import type { TextRange } from '@/shared/lib/files-drag';
import type * as port from '../types/code-editor';
import { withEol } from './text';

/**
 * The editor's one worker — the diff and the word ranges run there — bundled by our build and
 * served from our origin: **no byte comes from a CDN** (07 · D-09). No language worker exists.
 */
globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };

/**
 * JSON has no grammar among Monaco's — only a language service, which is left out. A small one, so a
 * `.json` file is coloured like the rest.
 */
monaco.languages.register({ id: 'json', extensions: ['.json', '.jsonc'], aliases: ['JSON'] });
monaco.languages.setMonarchTokensProvider('json', {
  tokenizer: {
    root: [
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'type'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/\b(?:true|false|null)\b/, 'keyword'],
      [/\/\/.*$/, 'comment'],
      [/[{}[\],:]/, 'delimiter'],
    ],
  },
});

const EOL_SEQUENCE: Readonly<Record<port.LineEnding, monaco.editor.EndOfLineSequence>> = {
  lf: monaco.editor.EndOfLineSequence.LF,
  crlf: monaco.editor.EndOfLineSequence.CRLF,
};

/** A Monaco text model behind the port. */
class MonacoModel implements port.TextModel {
  constructor(readonly inner: monaco.editor.ITextModel) {}

  getValue(): string {
    return this.inner.getValue();
  }

  setValue(text: string): void {
    const next = withEol(text, this.eol());

    if (next !== this.inner.getValue()) {
      this.inner.pushStackElement();
      this.inner.pushEditOperations(
        [],
        [{ range: this.inner.getFullModelRange(), text: next }],
        () => null,
      );
      this.inner.pushStackElement();
    }
  }

  reload(text: string): void {
    // `setValue` of Monaco replaces the text and starts the undo history over (B-36).
    this.inner.setValue(text);
  }

  version(): number {
    return this.inner.getAlternativeVersionId();
  }

  canUndo(): boolean {
    return this.inner.canUndo();
  }

  canRedo(): boolean {
    return this.inner.canRedo();
  }

  undo(): void {
    void this.inner.undo();
  }

  redo(): void {
    void this.inner.redo();
  }

  eol(): port.LineEnding {
    return this.inner.getEOL() === '\r\n' ? 'crlf' : 'lf';
  }

  setEol(eol: port.LineEnding): void {
    if (eol !== this.eol()) {
      // On the undo history, as an edit: it dirties the file, and undoing it is clean again (S-248).
      this.inner.pushEOL(EOL_SEQUENCE[eol]);
    }
  }

  language(): string {
    return this.inner.getLanguageId();
  }

  setLanguage(language: string): void {
    monaco.editor.setModelLanguage(this.inner, language);
  }

  onDidChange(listener: () => void): () => void {
    const content = this.inner.onDidChangeContent(listener);
    const language = this.inner.onDidChangeLanguage(listener);

    return () => {
      content.dispose();
      language.dispose();
    };
  }

  dispose(): void {
    this.inner.dispose();
  }
}

/** What Monaco is told for the preferences — and nothing that would bring a language's intelligence. */
function editorOptions(
  options: port.ViewOptions,
): monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions {
  return {
    ariaLabel: options.label,
    fontSize: options.fontSize,
    fontFamily: options.fontFamily,
    wordWrap: options.wordWrap ? 'on' : 'off',
    minimap: { enabled: options.minimap && !options.light },
    folding: !options.light,
    readOnly: options.readOnly,
    automaticLayout: true,
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'off',
    parameterHints: { enabled: false },
    hover: { enabled: 'off' },
    codeLens: false,
    lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
    inlayHints: { enabled: 'off' },
  };
}

const KEY_NAMES: Readonly<Record<string, monaco.KeyCode>> = {
  ArrowLeft: monaco.KeyCode.LeftArrow,
  ArrowRight: monaco.KeyCode.RightArrow,
  ArrowUp: monaco.KeyCode.UpArrow,
  ArrowDown: monaco.KeyCode.DownArrow,
};

const MODIFIER_BITS: Readonly<Record<string, number>> = {
  mod: monaco.KeyMod.CtrlCmd,
  cmd: monaco.KeyMod.CtrlCmd,
  meta: monaco.KeyMod.CtrlCmd,
  ctrl: monaco.KeyMod.WinCtrl,
  shift: monaco.KeyMod.Shift,
  alt: monaco.KeyMod.Alt,
};

/** One chord of ours — `Mod+K` — as a Monaco keybinding. */
function chordCode(chord: string): number {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  const named = /^[a-z]$/i.test(key)
    ? `Key${key.toUpperCase()}`
    : /^\d$/.test(key)
      ? `Digit${key}`
      : key;
  const code = KEY_NAMES[key] ?? (monaco.KeyCode as unknown as Record<string, number>)[named] ?? 0;

  return parts.reduce((bits, part) => bits | (MODIFIER_BITS[part.toLowerCase()] ?? 0), code);
}

/** A key of ours — a chord, or a sequence of two — as a Monaco keybinding. */
export function keybindingOf(key: string): number {
  const [first = '', second] = key.split(' ');
  const head = chordCode(first);

  return second === undefined ? head : monaco.KeyMod.chord(head, chordCode(second));
}

/** The model of the port behind a Monaco one, when it was made by this adapter. */
function innerOf(model: port.TextModel | null): monaco.editor.ITextModel | null {
  return model instanceof MonacoModel ? model.inner : null;
}

/** A Monaco editor behind the port. */
class MonacoView implements port.CodeView {
  readonly capabilities = { find: true, goToLine: true };
  private readonly editor: monaco.editor.IStandaloneCodeEditor;
  private options: port.ViewOptions;

  constructor(host: HTMLElement, options: port.ViewOptions) {
    this.options = options;
    this.editor = monaco.editor.create(host, { ...editorOptions(options), model: null });
  }

  setModel(model: port.TextModel | null): void {
    this.editor.setModel(innerOf(model));
    this.indent();
  }

  focus(): void {
    this.editor.focus();
  }

  position(): port.TextPosition {
    const position = this.editor.getPosition();
    return { line: position?.lineNumber ?? 1, column: position?.column ?? 1 };
  }

  setPosition(position: port.TextPosition): void {
    this.editor.setPosition({ lineNumber: position.line, column: position.column });
    this.editor.revealPositionInCenterIfOutsideViewport({
      lineNumber: position.line,
      column: position.column,
    });
  }

  selection(): TextRange | null {
    const selection = this.editor.getSelection();

    if (selection === null || selection.isEmpty()) {
      return null;
    }

    return {
      startLine: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLine: selection.endLineNumber,
      endColumn: selection.endColumn,
    };
  }

  selections(): readonly TextRange[] {
    return (this.editor.getSelections() ?? [])
      .filter((selection) => !selection.isEmpty())
      .map((selection) => ({
        startLine: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLine: selection.endLineNumber,
        endColumn: selection.endColumn,
      }));
  }

  selectionLength(): number {
    const selection = this.editor.getSelection();
    const model = this.editor.getModel();

    return selection === null || model === null ? 0 : model.getValueLengthInRange(selection);
  }

  scrollTop(): number {
    return this.editor.getScrollTop();
  }

  setScrollTop(top: number): void {
    this.editor.setScrollTop(top);
  }

  update(options: port.ViewOptions): void {
    this.options = options;
    this.editor.updateOptions(editorOptions(options));
    this.indent();
  }

  onCursorChange(listener: () => void): () => void {
    const subscription = this.editor.onDidChangeCursorSelection(listener);
    return () => {
      subscription.dispose();
    };
  }

  onBlur(listener: () => void): () => void {
    const subscription = this.editor.onDidBlurEditorText(listener);
    return () => {
      subscription.dispose();
    };
  }

  find(replace: boolean): void {
    this.editor.focus();
    void this.editor
      .getAction(replace ? 'editor.action.startFindReplaceAction' : 'actions.find')
      ?.run();
  }

  goToLine(): void {
    this.editor.focus();
    void this.editor.getAction('editor.action.gotoLine')?.run();
  }

  bindKey(key: string, run: () => void): () => void {
    const action = this.editor.addAction({
      id: `remote-claude.key.${key}`,
      label: key,
      keybindings: [keybindingOf(key)],
      run,
    });

    return () => {
      action.dispose();
    };
  }

  addContextAction(action: port.ContextAction): () => void {
    const added = this.editor.addAction({
      id: `remote-claude.${action.id}`,
      label: action.label,
      precondition: 'editorHasSelection',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: action.run,
    });

    return () => {
      added.dispose();
    };
  }

  dispose(): void {
    this.editor.dispose();
  }

  /** Tab size and spaces are the text's options in Monaco, not the editor's. */
  private indent(): void {
    this.editor.getModel()?.updateOptions({
      tabSize: this.options.tabSize,
      insertSpaces: this.options.insertSpaces,
    });
  }
}

/** The read-only diff of Monaco — its own two texts, disposed of with it. */
class MonacoDiffView implements port.CodeDiffView {
  private readonly diff: monaco.editor.IStandaloneDiffEditor;
  private readonly models: readonly monaco.editor.ITextModel[];

  constructor(host: HTMLElement, content: port.DiffContent, options: port.ViewOptions) {
    this.diff = monaco.editor.createDiffEditor(host, {
      ...editorOptions({ ...options, readOnly: true }),
      originalEditable: false,
      renderSideBySide: true,
    });
    const original = monaco.editor.createModel(content.original, content.language);
    const modified = monaco.editor.createModel(content.modified, content.language);
    this.models = [original, modified];
    this.diff.setModel({ original, modified });
  }

  update(options: port.ViewOptions): void {
    this.diff.updateOptions(editorOptions({ ...options, readOnly: true }));
  }

  dispose(): void {
    this.diff.dispose();

    for (const model of this.models) {
      model.dispose();
    }
  }
}

/** The dark theme of the editor: Monaco's, with what it draws below the contrast of WCAG AA mended. */
const DARK_THEME = 'remote-claude-dark';

/** Monaco's theme for each of the app's two. */
const THEMES: Readonly<Record<port.EditorTheme, string>> = { light: 'vs', dark: DARK_THEME };

/**
 * The editor of the desktop: Monaco, in a chunk of its own that only an open file loads, served by
 * our build (07 · D-09, S-204). Two themes, the app's two (S-207) — the dark one with comments in the
 * green of VS Code's Dark+, 5:1 on the editor's background, where `vs-dark`'s is 4.2:1 and fails AA
 * (S-289).
 */
export function createMonacoEngine(): port.CodeEditorEngine {
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'comment', foreground: '6A9955' }],
    colors: {},
  });

  return {
    kind: 'monaco',
    createModel: (init: port.TextModelInit) => {
      const model = monaco.editor.createModel(init.content, init.language);
      model.setEOL(EOL_SEQUENCE[init.eol]);
      return new MonacoModel(model);
    },
    createView: (host, options) => new MonacoView(host, options),
    createDiffView: (host, content, options) => new MonacoDiffView(host, content, options),
    colorize: (code, language) => monaco.editor.colorize(code, language, { tabSize: 2 }),
    setTheme: (theme) => {
      monaco.editor.setTheme(THEMES[theme]);
    },
  };
}
