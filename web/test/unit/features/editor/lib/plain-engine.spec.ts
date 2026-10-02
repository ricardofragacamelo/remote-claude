import { describe, expect, it, vi } from 'vitest';

import { createPlainEngine } from '@/features/editor/lib/plain-engine';
import { VIEW_OPTIONS, codeEditorContract } from '../../../../support/code-editor-contract';

codeEditorContract('the simplified mode', createPlainEngine);

function aView(content = 'one\ntwo') {
  const engine = createPlainEngine();
  const host = document.createElement('div');
  document.body.append(host);
  const view = engine.createView(host, VIEW_OPTIONS);
  const model = engine.createModel({ content, eol: 'lf', language: 'plaintext' });
  view.setModel(model);
  const area = host.querySelector('textarea') as HTMLTextAreaElement;
  return { engine, host, view, model, area };
}

function key(area: HTMLTextAreaElement, init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  area.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('the simplified mode — plan 07, S-206', () => {
  it('is a text area named for its file, readable, with the options of the preferences', () => {
    const { area, view } = aView();

    expect(area).toHaveAccessibleName('Editor of a.ts');
    expect(area.value).toBe('one\ntwo');
    expect(area.style.fontSize).toBe('13px');
    expect(area.wrap).toBe('off');

    view.update({ ...VIEW_OPTIONS, readOnly: true, wordWrap: true, label: 'Other' });
    expect(area.readOnly).toBe(true);
    expect(area.wrap).toBe('soft');
    expect(area).toHaveAccessibleName('Other');
    expect(view.capabilities).toEqual({ find: false, goToLine: false });
  });

  it('edits its model by typing, keeping the line endings of the file', () => {
    const engine = createPlainEngine();
    const host = document.createElement('div');
    const view = engine.createView(host, VIEW_OPTIONS);
    const model = engine.createModel({ content: 'a\r\nb', eol: 'crlf', language: 'plaintext' });
    view.setModel(model);
    const area = host.querySelector('textarea') as HTMLTextAreaElement;

    area.value = 'a\nb\nc';
    area.dispatchEvent(new Event('input'));
    expect(model.getValue()).toBe('a\r\nb\r\nc');
  });

  it("undoes and redoes with the model's history, not the browser's", () => {
    const { area, model } = aView('one');

    model.setValue('two');
    expect(key(area, { key: 'z', ctrlKey: true })).toBe(true);
    expect(area.value).toBe('one');
    expect(key(area, { key: 'Z', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(area.value).toBe('two');
    model.undo();
    expect(key(area, { key: 'y', metaKey: true })).toBe(true);
    expect(area.value).toBe('two');
    expect(key(area, { key: 'a', ctrlKey: true })).toBe(false);
    expect(key(area, { key: 'z' })).toBe(false);
    expect(key(area, { key: 'z', ctrlKey: true, altKey: true })).toBe(false);
  });

  it('keeps the cursor where it was when the model changes under it', () => {
    const { area, model } = aView('abcdef');

    area.setSelectionRange(3, 3);
    model.reload('abcdefgh');
    expect(area.value).toBe('abcdefgh');
    expect(area.selectionStart).toBe(3);
    model.reload('ab');
    expect(area.selectionStart).toBe(2);
  });

  it('reports the selection as a range, and tells of cursor moves and of the focus leaving', () => {
    const { area, view } = aView('ab\ncd');
    const moved = vi.fn();
    const blurred = vi.fn();
    const stopMoves = view.onCursorChange(moved);
    const stopBlur = view.onBlur(blurred);

    area.setSelectionRange(1, 4);
    area.dispatchEvent(new Event('select'));
    expect(view.selection()).toEqual({ startLine: 1, startColumn: 2, endLine: 2, endColumn: 2 });
    expect(view.selectionLength()).toBe(3);
    area.dispatchEvent(new Event('blur'));
    expect(moved).toHaveBeenCalled();
    expect(blurred).toHaveBeenCalledTimes(1);

    stopMoves();
    stopBlur();
    area.dispatchEvent(new Event('blur'));
    expect(blurred).toHaveBeenCalledTimes(1);
  });

  it('scrolls, finds and goes to a line by focusing — it has no widget of its own', () => {
    const { area, view } = aView();

    view.setScrollTop(40);
    expect(view.scrollTop()).toBe(area.scrollTop);
    view.find(false);
    expect(document.activeElement).toBe(area);
    area.blur();
    view.goToLine();
    expect(document.activeElement).toBe(area);
    view.bindKey('Mod+K S', vi.fn())();
    view.addContextAction({ id: 'x', label: 'x', run: vi.fn() })();
  });

  it('shows nothing without a model, and leaves its host empty once disposed of', () => {
    const { area, view, host, model } = aView();

    view.setModel(null);
    expect(area.value).toBe('');
    model.setValue('changed');
    expect(area.value).toBe('');
    area.dispatchEvent(new Event('input'));
    expect(key(area, { key: 'z', ctrlKey: true })).toBe(false);
    view.dispose();
    expect(host.querySelector('textarea')).toBeNull();
  });

  it('diffs two texts side by side, read-only, each side named', () => {
    const engine = createPlainEngine();
    const host = document.createElement('div');
    const diff = engine.createDiffView(
      host,
      {
        original: 'a\r\n',
        modified: 'b',
        language: 'plaintext',
        originalLabel: 'On disk',
        modifiedLabel: 'Mine',
      },
      VIEW_OPTIONS,
    );
    const areas = [...host.querySelectorAll('textarea')];

    expect(areas.map((area) => [area.value, area.readOnly])).toEqual([
      ['a\n', true],
      ['b', true],
    ]);
    expect(areas[0]).toHaveAccessibleName('On disk');
    expect(areas[1]).toHaveAccessibleName('Mine');
    diff.update({ ...VIEW_OPTIONS, fontSize: 20 });
    expect(areas[0]?.style.fontSize).toBe('20px');
    diff.dispose();
    expect(host.children).toHaveLength(0);
    engine.setTheme('dark');
  });
});
