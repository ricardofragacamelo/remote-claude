import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Monaco adapter of the port, against a stand-in of the parts of Monaco it calls: Monaco needs a
 * real browser, and is exercised for real end to end (e2e/specs/editor-native.spec.ts). Here, what is
 * checked is the adapter's own work — what it asks of Monaco for each call of the port, and that it
 * asks for no language intelligence (07 · D-09).
 */

const monaco = vi.hoisted(() => {
  type Listener = () => void;

  class FakeModel {
    value: string;
    eol = '\n';
    language: string;
    version = 1;
    undos: string[] = [];
    redos: string[] = [];
    disposed = false;
    options: Record<string, unknown> = {};
    readonly content = new Set<Listener>();
    readonly languages = new Set<Listener>();
    stack = 0;

    constructor(value: string, language: string) {
      this.value = value;
      this.language = language;
    }

    private emit(): void {
      this.version += 1;
      for (const listener of this.content) listener();
    }

    getValue(): string {
      return this.value.replace(/\r?\n/g, this.eol);
    }
    getFullModelRange(): string {
      return 'all';
    }
    pushStackElement(): void {
      this.stack += 1;
    }
    pushEditOperations(_: unknown, edits: { text: string }[]): void {
      this.undos.push(this.value);
      this.value = edits[0]?.text ?? '';
      this.emit();
    }
    setValue(value: string): void {
      this.undos = [];
      this.value = value;
      this.emit();
    }
    getAlternativeVersionId(): number {
      return this.version;
    }
    canUndo(): boolean {
      return this.undos.length > 0;
    }
    canRedo(): boolean {
      return this.redos.length > 0;
    }
    undo(): void {
      this.redos.push(this.value);
      this.value = this.undos.pop() ?? this.value;
      this.emit();
    }
    redo(): void {
      this.undos.push(this.value);
      this.value = this.redos.pop() ?? this.value;
      this.emit();
    }
    getEOL(): string {
      return this.eol;
    }
    pushEOL(sequence: number): void {
      this.eol = sequence === 1 ? '\r\n' : '\n';
      this.emit();
    }
    setEOL(sequence: number): void {
      this.eol = sequence === 1 ? '\r\n' : '\n';
    }
    getLanguageId(): string {
      return this.language;
    }
    onDidChangeContent(listener: Listener) {
      this.content.add(listener);
      return { dispose: () => this.content.delete(listener) };
    }
    onDidChangeLanguage(listener: Listener) {
      this.languages.add(listener);
      return { dispose: () => this.languages.delete(listener) };
    }
    getValueLengthInRange(): number {
      return 3;
    }
    updateOptions(options: Record<string, unknown>): void {
      this.options = { ...this.options, ...options };
    }
    dispose(): void {
      this.disposed = true;
    }
  }

  class FakeEditor {
    model: FakeModel | null = null;
    options: Record<string, unknown>;
    position: { lineNumber: number; column: number } | null = { lineNumber: 1, column: 1 };
    selection: { empty: boolean } | null = { empty: true };
    scroll = 0;
    focused = 0;
    disposed = false;
    readonly actions: Record<string, unknown>[] = [];
    readonly ran: string[] = [];
    readonly cursor = new Set<Listener>();
    readonly blur = new Set<Listener>();

    constructor(
      readonly host: HTMLElement,
      options: Record<string, unknown>,
    ) {
      this.options = options;
    }

    setModel(model: FakeModel | null): void {
      this.model = model;
    }
    getModel(): FakeModel | null {
      return this.model;
    }
    focus(): void {
      this.focused += 1;
    }
    getPosition() {
      return this.position;
    }
    setPosition(position: { lineNumber: number; column: number }): void {
      this.position = position;
    }
    revealPositionInCenterIfOutsideViewport(): void {}
    getSelection() {
      return this.selection === null
        ? null
        : {
            isEmpty: () => this.selection?.empty === true,
            startLineNumber: 1,
            startColumn: 2,
            endLineNumber: 3,
            endColumn: 4,
          };
    }
    getScrollTop(): number {
      return this.scroll;
    }
    setScrollTop(top: number): void {
      this.scroll = top;
    }
    updateOptions(options: Record<string, unknown>): void {
      this.options = { ...this.options, ...options };
    }
    onDidChangeCursorSelection(listener: Listener) {
      this.cursor.add(listener);
      return { dispose: () => this.cursor.delete(listener) };
    }
    onDidBlurEditorText(listener: Listener) {
      this.blur.add(listener);
      return { dispose: () => this.blur.delete(listener) };
    }
    getAction(id: string) {
      return id === 'missing' ? null : { run: () => Promise.resolve(this.ran.push(id)) };
    }
    addAction(action: Record<string, unknown>) {
      this.actions.push(action);
      return { dispose: () => this.actions.splice(this.actions.indexOf(action), 1) };
    }
    dispose(): void {
      this.disposed = true;
    }
  }

  class FakeDiff {
    models: { original: FakeModel; modified: FakeModel } | null = null;
    disposed = false;
    constructor(
      readonly host: HTMLElement,
      public options: Record<string, unknown>,
    ) {}
    setModel(models: { original: FakeModel; modified: FakeModel }): void {
      this.models = models;
    }
    updateOptions(options: Record<string, unknown>): void {
      this.options = { ...this.options, ...options };
    }
    dispose(): void {
      this.disposed = true;
    }
  }

  const made = { editors: [] as FakeEditor[], diffs: [] as FakeDiff[], models: [] as FakeModel[] };
  const keys = ['K', 'S', 'A', 'F'];

  return {
    made,
    theme: { current: '', defined: new Map<string, unknown>() },
    languages: { registered: [] as unknown[], tokens: [] as unknown[] },
    api: {
      KeyMod: {
        CtrlCmd: 2048,
        Shift: 1024,
        Alt: 512,
        WinCtrl: 256,
        chord: (a: number, b: number) => a + b * 65536,
      },
      KeyCode: {
        LeftArrow: 15,
        RightArrow: 17,
        UpArrow: 16,
        DownArrow: 18,
        Digit1: 23,
        ...Object.fromEntries(keys.map((key, index) => [`Key${key}`, 40 + index])),
      },
      languages: {
        register: () => undefined,
        setMonarchTokensProvider: () => undefined,
      },
      editor: {
        EndOfLineSequence: { LF: 0, CRLF: 1 },
        ShowLightbulbIconMode: { Off: 'off' },
        createModel: (value: string, language: string) => {
          const model = new FakeModel(value, language);
          made.models.push(model);
          return model;
        },
        setModelLanguage: (model: FakeModel, language: string) => {
          model.language = language;
          for (const listener of model.languages) listener();
        },
        create: (host: HTMLElement, options: Record<string, unknown>) => {
          const editor = new FakeEditor(host, options);
          made.editors.push(editor);
          return editor;
        },
        createDiffEditor: (host: HTMLElement, options: Record<string, unknown>) => {
          const diff = new FakeDiff(host, options);
          made.diffs.push(diff);
          return diff;
        },
      },
    },
  };
});

vi.mock('monaco-editor/editor/editor.api', () => ({
  ...monaco.api,
  languages: {
    register: (language: unknown) => monaco.languages.registered.push(language),
    setMonarchTokensProvider: (_: string, tokens: unknown) => monaco.languages.tokens.push(tokens),
  },
  editor: {
    ...monaco.api.editor,
    setTheme: (theme: string) => {
      monaco.theme.current = theme;
    },
    defineTheme: (name: string, data: unknown) => {
      monaco.theme.defined.set(name, data);
    },
  },
}));
vi.mock('monaco-editor/editor/editor.worker?worker', () => ({
  default: class Worker {
    readonly kind = 'editor worker';
  },
}));
vi.mock('monaco-editor/features/register.all', () => ({}));
vi.mock('monaco-editor/languages/definitions/bat/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/cpp/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/csharp/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/css/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/dart/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/dockerfile/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/go/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/graphql/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/html/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/ini/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/java/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/javascript/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/kotlin/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/less/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/lua/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/markdown/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/perl/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/php/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/powershell/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/python/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/r/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/ruby/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/rust/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/scss/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/shell/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/sql/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/swift/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/typescript/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/xml/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/yaml/register', () => ({}));

const { createMonacoEngine, keybindingOf } = await import('@/features/editor/lib/monaco-engine');
const { VIEW_OPTIONS } = await import('../../../../support/code-editor-contract');

beforeEach(() => {
  monaco.made.editors.length = 0;
  monaco.made.diffs.length = 0;
  monaco.made.models.length = 0;
});

describe('loading the Monaco adapter — plan 07, B-31', () => {
  it('serves the one worker from our build, and gives JSON a grammar of its own', () => {
    const environment = globalThis.MonacoEnvironment as unknown as {
      getWorker(): { kind: string };
    };

    expect(environment.getWorker().kind).toBe('editor worker');
    expect(monaco.languages.registered).toEqual([
      expect.objectContaining({ id: 'json', extensions: ['.json', '.jsonc'] }),
    ]);
    expect(monaco.languages.tokens).toHaveLength(1);
  });
});

describe('the model of the Monaco adapter', () => {
  it('maps the port onto a Monaco text model', () => {
    const engine = createMonacoEngine();
    const model = engine.createModel({ content: 'a\nb', eol: 'crlf', language: 'typescript' });
    const inner = monaco.made.models[0];
    const listener = vi.fn();
    const stop = model.onDidChange(listener);

    expect(engine.kind).toBe('monaco');
    expect(model.getValue()).toBe('a\r\nb');
    expect(model.eol()).toBe('crlf');

    const saved = model.version();
    model.setValue('a\nb');
    expect(model.version()).toBe(saved);
    model.setValue('a\nb\nc');
    expect(inner?.value).toBe('a\r\nb\r\nc');
    expect(model.canUndo()).toBe(true);
    model.undo();
    expect(model.canRedo()).toBe(true);
    model.redo();

    model.setEol('crlf');
    model.setEol('lf');
    expect(model.eol()).toBe('lf');
    model.setLanguage('python');
    expect(model.language()).toBe('python');
    model.reload('fresh');
    expect(model.getValue()).toBe('fresh');
    expect(listener).toHaveBeenCalled();

    stop();
    model.dispose();
    expect(inner?.disposed).toBe(true);
  });
});

describe('the view of the Monaco adapter', () => {
  function aView() {
    const engine = createMonacoEngine();
    const view = engine.createView(document.createElement('div'), VIEW_OPTIONS);
    const editor = monaco.made.editors[0];
    const model = engine.createModel({ content: 'x', eol: 'lf', language: 'plaintext' });

    return { engine, view, editor, model };
  }

  it('asks for highlighting and nothing more — no suggestions, no hover, no lightbulb', () => {
    const { editor } = aView();

    expect(editor?.options).toMatchObject({
      ariaLabel: 'Editor of a.ts',
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      wordBasedSuggestions: 'off',
      parameterHints: { enabled: false },
      hover: { enabled: 'off' },
      codeLens: false,
      inlayHints: { enabled: 'off' },
      minimap: { enabled: true },
      folding: true,
      model: null,
    });
  });

  it('drops the minimap and folding in the light mode, whatever the preferences say — S-255', () => {
    const { view, editor } = aView();

    view.update({ ...VIEW_OPTIONS, light: true, wordWrap: true });
    expect(editor?.options).toMatchObject({
      minimap: { enabled: false },
      folding: false,
      wordWrap: 'on',
    });
  });

  it('shows a model, its indentation set on the text, and only a model it made', () => {
    const { view, editor, model } = aView();

    view.setModel(model);
    expect(editor?.model).toBe(monaco.made.models[0]);
    expect(editor?.model?.options).toEqual({ tabSize: 4, insertSpaces: true });
    view.setModel(null);
    expect(editor?.model).toBeNull();
  });

  it('moves the cursor, reads the selection and the scroll', () => {
    const { view, editor, model } = aView();
    view.setModel(model);

    view.setPosition({ line: 3, column: 4 });
    expect(view.position()).toEqual({ line: 3, column: 4 });
    expect(view.selection()).toBeNull();
    if (editor !== undefined) editor.selection = { empty: false };
    expect(view.selection()).toEqual({ startLine: 1, startColumn: 2, endLine: 3, endColumn: 4 });
    expect(view.selectionLength()).toBe(3);
    view.setScrollTop(12);
    expect(view.scrollTop()).toBe(12);

    if (editor !== undefined) {
      editor.position = null;
      editor.selection = null;
    }
    expect(view.position()).toEqual({ line: 1, column: 1 });
    expect(view.selection()).toBeNull();
    expect(view.selectionLength()).toBe(0);
  });

  it("opens Monaco's own find, replace and go to line — B-36", async () => {
    const { view, editor } = aView();

    view.find(false);
    view.find(true);
    view.goToLine();
    view.focus();
    await Promise.resolve();

    expect(editor?.ran).toEqual([
      'actions.find',
      'editor.action.startFindReplaceAction',
      'editor.action.gotoLine',
    ]);
    expect(editor?.focused).toBe(4);
    expect(view.capabilities).toEqual({ find: true, goToLine: true });
  });

  it('tells of cursor moves and of the focus leaving, until told to stop', () => {
    const { view, editor } = aView();
    const moved = vi.fn();
    const blurred = vi.fn();
    const stopMoves = view.onCursorChange(moved);
    const stopBlur = view.onBlur(blurred);

    for (const listener of editor?.cursor ?? []) listener();
    for (const listener of editor?.blur ?? []) listener();
    stopMoves();
    stopBlur();

    expect(moved).toHaveBeenCalledTimes(1);
    expect(blurred).toHaveBeenCalledTimes(1);
    expect(editor?.cursor.size).toBe(0);
    expect(editor?.blur.size).toBe(0);
  });

  it('binds a sequence of ours inside the editor, and adds the selection action to its menu', () => {
    const { view, editor } = aView();
    const run = vi.fn();

    const unbind = view.bindKey('Mod+K S', run);
    const remove = view.addContextAction({
      id: 'addSelectionToClaude',
      label: 'Add selection to chat',
      run,
    });

    expect(editor?.actions).toEqual([
      expect.objectContaining({ keybindings: [keybindingOf('Mod+K S')] }),
      expect.objectContaining({
        id: 'remote-claude.addSelectionToClaude',
        precondition: 'editorHasSelection',
        contextMenuGroupId: 'navigation',
      }),
    ]);
    unbind();
    remove();
    expect(editor?.actions).toEqual([]);
    view.dispose();
    expect(editor?.disposed).toBe(true);
  });
});

describe('a key of ours, as Monaco reads it', () => {
  it('is a chord of modifiers and a key — or a sequence of two', () => {
    expect(keybindingOf('Mod+S')).toBe(2048 + 41);
    expect(keybindingOf('Ctrl+Shift+Alt+F')).toBe(256 + 1024 + 512 + 43);
    expect(keybindingOf('Cmd+1')).toBe(2048 + 23);
    expect(keybindingOf('Mod+ArrowLeft')).toBe(2048 + 15);
    expect(keybindingOf('Mod+K S')).toBe(2048 + 40 + 41 * 65536);
    expect(keybindingOf('Hyper+Q')).toBe(0);
  });
});

describe('the diff of the Monaco adapter — plan 07, B-38', () => {
  it('is read-only, made of its own two texts, which go with it', () => {
    const engine = createMonacoEngine();
    const diff = engine.createDiffView(
      document.createElement('div'),
      {
        original: 'a',
        modified: 'b',
        language: 'typescript',
        originalLabel: 'disk',
        modifiedLabel: 'mine',
      },
      VIEW_OPTIONS,
    );
    const made = monaco.made.diffs[0];

    expect(made?.options).toMatchObject({
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
    });
    expect(made?.models?.original.value).toBe('a');
    expect(made?.models?.modified.value).toBe('b');
    diff.update({ ...VIEW_OPTIONS, fontSize: 20 });
    expect(made?.options).toMatchObject({ fontSize: 20, readOnly: true });
    diff.dispose();
    expect(made?.disposed).toBe(true);
    expect(monaco.made.models.every((model) => model.disposed)).toBe(true);
  });
});

describe('the theme — plan 07, S-207', () => {
  it("is Monaco's light, or its dark with the comments mended, as the app's", () => {
    const engine = createMonacoEngine();

    engine.setTheme('dark');
    expect(monaco.theme.current).toBe('remote-claude-dark');
    engine.setTheme('light');
    expect(monaco.theme.current).toBe('vs');
  });

  it('draws comments of the dark theme at 4.5:1 or more on its background — S-289', () => {
    createMonacoEngine();

    const dark = monaco.theme.defined.get('remote-claude-dark') as {
      base: string;
      inherit: boolean;
      rules: { token: string; foreground: string }[];
    };
    expect(dark).toMatchObject({ base: 'vs-dark', inherit: true });
    const comment = dark.rules.find((rule) => rule.token === 'comment');
    // `vs-dark` paints the editor #1e1e1e.
    expect(contrast(comment?.foreground ?? '000000', '1e1e1e')).toBeGreaterThanOrEqual(4.5);
  });
});

/** The contrast ratio of two colours, as WCAG 2.1 defines it. */
function contrast(first: string, second: string): number {
  const luminance = (hex: string): number => {
    const [red = 0, green = 0, blue = 0] = [0, 2, 4].map((at) => {
      const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);

  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}
