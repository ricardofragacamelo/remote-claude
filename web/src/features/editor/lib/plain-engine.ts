import type { TextRange } from '@/shared/lib/files-drag';
import type {
  CodeDiffView,
  CodeEditorEngine,
  CodeView,
  ContextAction,
  DiffContent,
  LineEnding,
  TextModel,
  TextModelInit,
  TextPosition,
  ViewOptions,
} from '../types/code-editor';
import { offsetAt, positionAt, withEol } from './text';

/** One state of a text, to come back to by undoing. */
interface Snapshot {
  readonly text: string;
  readonly eol: LineEnding;
  readonly version: number;
}

/**
 * A text with its undo history, held as lines ending in `\n` and given back with its own line
 * ending — what the simplified mode edits, and what jsdom tests the editor with (07 · D-09).
 */
class PlainModel implements TextModel {
  private text: string;
  private lineEnding: LineEnding;
  private lang: string;
  private current = 1;
  private counter = 1;
  private undos: Snapshot[] = [];
  private redos: Snapshot[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(init: TextModelInit) {
    this.text = withEol(init.content, 'lf');
    this.lineEnding = init.eol;
    this.lang = init.language;
  }

  getValue(): string {
    return withEol(this.text, this.lineEnding);
  }

  setValue(text: string): void {
    const next = withEol(text, 'lf');

    if (next !== this.text) {
      this.remember();
      this.text = next;
      this.bump();
    }
  }

  reload(text: string): void {
    this.undos = [];
    this.redos = [];
    this.text = withEol(text, 'lf');
    this.bump();
  }

  version(): number {
    return this.current;
  }

  canUndo(): boolean {
    return this.undos.length > 0;
  }

  canRedo(): boolean {
    return this.redos.length > 0;
  }

  undo(): void {
    this.step(this.undos, this.redos);
  }

  redo(): void {
    this.step(this.redos, this.undos);
  }

  eol(): LineEnding {
    return this.lineEnding;
  }

  setEol(eol: LineEnding): void {
    if (eol !== this.lineEnding) {
      this.remember();
      this.lineEnding = eol;
      this.bump();
    }
  }

  language(): string {
    return this.lang;
  }

  setLanguage(language: string): void {
    this.lang = language;
    this.emit();
  }

  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  private snapshot(): Snapshot {
    return { text: this.text, eol: this.lineEnding, version: this.current };
  }

  private remember(): void {
    this.undos.push(this.snapshot());
    this.redos = [];
  }

  /** Moves one state from `from` to the text, keeping the current one in `to`. */
  private step(from: Snapshot[], to: Snapshot[]): void {
    const state = from.pop();

    if (state !== undefined) {
      to.push(this.snapshot());
      this.text = state.text;
      this.lineEnding = state.eol;
      this.current = state.version;
      this.emit();
    }
  }

  private bump(): void {
    this.counter += 1;
    this.current = this.counter;
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

/** The text a text area shows of a model: its lines, ending in `\n`, as a text area keeps them. */
function shown(model: TextModel): string {
  return withEol(model.getValue(), 'lf');
}

function styleFor(element: HTMLElement, options: ViewOptions): void {
  element.style.fontSize = `${String(options.fontSize)}px`;
  element.style.fontFamily = options.fontFamily;
  element.style.tabSize = String(options.tabSize);
}

/** Whether a key press is undo (`-1`), redo (`1`) or neither. */
function historyStep(event: KeyboardEvent): -1 | 1 | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();

  if (key === 'z') {
    return event.shiftKey ? 1 : -1;
  }

  return key === 'y' ? 1 : null;
}

/**
 * The editor of the simplified mode: a text area, readable, with the same save rules as the full
 * editor — undo and redo are the model's, so they are the same history whichever view edits it.
 */
class PlainView implements CodeView {
  readonly capabilities = { find: false, goToLine: false };
  private readonly area: HTMLTextAreaElement;
  private model: TextModel | null = null;
  private release: () => void = () => undefined;

  constructor(host: HTMLElement, options: ViewOptions) {
    this.area = document.createElement('textarea');
    this.area.className =
      'size-full resize-none bg-background p-2 font-code text-foreground focus-visible:outline-2 focus-visible:outline-ring';
    this.area.spellcheck = false;
    this.area.setAttribute('autocapitalize', 'off');
    this.area.addEventListener('input', this.typed);
    this.area.addEventListener('keydown', this.keyed);
    host.append(this.area);
    this.update(options);
  }

  setModel(model: TextModel | null): void {
    this.release();
    this.model = model;
    this.area.value = model === null ? '' : shown(model);
    this.release =
      model === null
        ? () => undefined
        : model.onDidChange(() => {
            this.sync();
          });
  }

  focus(): void {
    this.area.focus();
  }

  position(): TextPosition {
    return positionAt(this.area.value, this.area.selectionStart);
  }

  setPosition(position: TextPosition): void {
    const offset = offsetAt(this.area.value, position);
    this.area.setSelectionRange(offset, offset);
  }

  selection(): TextRange | null {
    const { selectionStart, selectionEnd, value } = this.area;

    if (selectionStart === selectionEnd) {
      return null;
    }

    const start = positionAt(value, selectionStart);
    const end = positionAt(value, selectionEnd);

    return {
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column,
    };
  }

  selectionLength(): number {
    return this.area.selectionEnd - this.area.selectionStart;
  }

  scrollTop(): number {
    return this.area.scrollTop;
  }

  setScrollTop(top: number): void {
    this.area.scrollTop = top;
  }

  update(options: ViewOptions): void {
    this.area.readOnly = options.readOnly;
    this.area.wrap = options.wordWrap ? 'soft' : 'off';
    this.area.setAttribute('aria-label', options.label);
    styleFor(this.area, options);
  }

  onCursorChange(listener: () => void): () => void {
    const events = ['select', 'keyup', 'mouseup', 'input'] as const;

    for (const event of events) {
      this.area.addEventListener(event, listener);
    }

    return () => {
      for (const event of events) {
        this.area.removeEventListener(event, listener);
      }
    };
  }

  onBlur(listener: () => void): () => void {
    this.area.addEventListener('blur', listener);
    return () => {
      this.area.removeEventListener('blur', listener);
    };
  }

  find(): void {
    this.focus();
  }

  goToLine(): void {
    this.focus();
  }

  bindKey(): () => void {
    // A text area keeps no key for itself: the shell's own listener sees every press here.
    return () => undefined;
  }

  addContextAction(action: ContextAction): () => void {
    void action;
    // The simplified mode has the browser's menu; the same action is in the palette and on its key.
    return () => undefined;
  }

  dispose(): void {
    this.release();
    this.area.removeEventListener('input', this.typed);
    this.area.removeEventListener('keydown', this.keyed);
    this.area.remove();
  }

  private readonly typed = (): void => {
    this.model?.setValue(withEol(this.area.value, this.model.eol()));
  };

  private readonly keyed = (event: KeyboardEvent): void => {
    const step = historyStep(event);

    if (step === null || this.model === null) {
      return;
    }

    event.preventDefault();

    if (step === -1) {
      this.model.undo();
    } else {
      this.model.redo();
    }
  };

  /** Shows what the model has now, keeping the cursor where it was. */
  private sync(): void {
    const text = this.model === null ? '' : shown(this.model);

    if (text !== this.area.value) {
      const { selectionStart, selectionEnd } = this.area;
      this.area.value = text;
      this.area.setSelectionRange(
        Math.min(selectionStart, text.length),
        Math.min(selectionEnd, text.length),
      );
    }
  }
}

/**
 * A side of the simplified diff: its text, read-only, named for a screen reader — the tab says above
 * it which side is which.
 */
function diffSide(label: string, text: string, options: ViewOptions): HTMLElement {
  const area = document.createElement('textarea');
  area.className = 'min-h-32 min-w-0 flex-1 resize-none bg-background p-2 font-code';
  area.readOnly = true;
  area.wrap = 'off';
  area.value = withEol(text, 'lf');
  area.setAttribute('aria-label', label);
  styleFor(area, options);
  return area;
}

/** The diff of the simplified mode: the two sides, one beside the other, read-only. */
class PlainDiffView implements CodeDiffView {
  private readonly frame: HTMLElement;

  constructor(host: HTMLElement, content: DiffContent, options: ViewOptions) {
    this.frame = document.createElement('div');
    this.frame.className = 'flex size-full flex-col gap-2 p-2 md:flex-row';
    this.frame.append(
      diffSide(content.originalLabel, content.original, options),
      diffSide(content.modifiedLabel, content.modified, options),
    );
    host.append(this.frame);
  }

  update(options: ViewOptions): void {
    for (const area of this.frame.querySelectorAll('textarea')) {
      styleFor(area, options);
    }
  }

  dispose(): void {
    this.frame.remove();
  }
}

/**
 * The editor of the simplified mode, below `md` (07 · D-09): a text area per tab, the same models,
 * the same save rules. It has no find, no "go to line" and no theme of its own — the page's tokens
 * colour it.
 */
export function createPlainEngine(): CodeEditorEngine {
  return {
    kind: 'plain',
    createModel: (init) => new PlainModel(init),
    createView: (host, options) => new PlainView(host, options),
    createDiffView: (host, content, options) => new PlainDiffView(host, content, options),
    setTheme: () => undefined,
  };
}
