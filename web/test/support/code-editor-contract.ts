import { describe, expect, it, vi } from 'vitest';

import type { CodeEditorEngine, ViewOptions } from '@/features/editor/types/code-editor';

export const VIEW_OPTIONS: ViewOptions = {
  label: 'Editor of a.ts',
  fontSize: 13,
  fontFamily: 'monospace',
  tabSize: 4,
  insertSpaces: true,
  wordWrap: false,
  minimap: true,
  readOnly: false,
  light: false,
};

/**
 * The contract of the port `CodeEditor` (07 · D-09, S-208): what every adapter honours, so that
 * components and hooks tested against one behave the same against the other — content, dirty (the
 * version undoing back to the saved one), cursor, undo and redo.
 *
 * @param name what to call the adapter in the report
 * @param make a fresh adapter
 */
export function codeEditorContract(name: string, make: () => CodeEditorEngine): void {
  describe(`the CodeEditor port, as ${name} honours it — plan 07, S-208`, () => {
    const model = (content = 'one\ntwo', eol: 'lf' | 'crlf' = 'lf') =>
      make().createModel({ content, eol, language: 'typescript' });

    it('gives the content back with its own line endings', () => {
      expect(model('a\nb', 'crlf').getValue()).toBe('a\r\nb');
      expect(model('a\r\nb', 'lf').getValue()).toBe('a\nb');
      expect(model().eol()).toBe('lf');
      expect(model().language()).toBe('typescript');
    });

    it('is dirty by its version: an edit moves it, undoing back gives the saved one again', () => {
      const text = model();
      const saved = text.version();

      text.setValue('one\ntwo\nthree');
      expect(text.version()).not.toBe(saved);
      expect(text.canUndo()).toBe(true);

      text.undo();
      expect(text.getValue()).toBe('one\ntwo');
      expect(text.version()).toBe(saved);
      expect(text.canRedo()).toBe(true);

      text.redo();
      expect(text.getValue()).toBe('one\ntwo\nthree');
      expect(text.version()).not.toBe(saved);
    });

    it('takes an edit that changes nothing as no edit', () => {
      const text = model();
      const saved = text.version();

      text.setValue('one\ntwo');
      expect(text.version()).toBe(saved);
      expect(text.canUndo()).toBe(false);
    });

    it('reloads from disk with a new version and no undo history', () => {
      const text = model();
      const before = text.version();

      text.setValue('edited');
      text.reload('from disk');
      expect(text.getValue()).toBe('from disk');
      expect(text.version()).not.toBe(before);
      expect(text.canUndo()).toBe(false);
    });

    it('converts its line endings as an edit, which undoes', () => {
      const text = model('a\nb');
      const saved = text.version();

      text.setEol('crlf');
      expect(text.getValue()).toBe('a\r\nb');
      expect(text.version()).not.toBe(saved);
      text.setEol('crlf');
      text.undo();
      expect(text.getValue()).toBe('a\nb');
      expect(text.version()).toBe(saved);
    });

    it('tells who listens of each change, until they stop', () => {
      const text = model();
      const listener = vi.fn();
      const stop = text.onDidChange(listener);

      text.setValue('x');
      text.setLanguage('python');
      expect(text.language()).toBe('python');
      expect(listener).toHaveBeenCalledTimes(2);

      stop();
      text.setValue('y');
      expect(listener).toHaveBeenCalledTimes(2);
      text.dispose();
    });

    it('shows a model in a view, with a cursor that goes where it is put', () => {
      const engine = make();
      const host = document.createElement('div');
      document.body.append(host);
      const view = engine.createView(host, VIEW_OPTIONS);
      const text = engine.createModel({ content: 'ab\ncd', eol: 'lf', language: 'plaintext' });

      view.setModel(text);
      view.setPosition({ line: 2, column: 2 });
      expect(view.position()).toEqual({ line: 2, column: 2 });
      expect(view.selection()).toBeNull();
      expect(view.selectionLength()).toBe(0);

      view.update({ ...VIEW_OPTIONS, wordWrap: true });
      view.focus();
      view.setModel(null);
      view.dispose();
      host.remove();
    });
  });
}
