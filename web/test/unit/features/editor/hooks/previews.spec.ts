import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  entryMoved,
  keepPreview,
  openFile,
  openPreview,
  reopenClosed,
  closeNow,
  togglePreview,
} from '@/features/editor/hooks/tabs';
import {
  activePathTab,
  pdfReaderCommands,
  previewCommands,
} from '@/features/editor/hooks/preview-commands';
import { leavePdfReader, reachPdfReader } from '@/features/editor/store/pdf-readers';
import { FOLDER, editorState } from '../../../../support/editor';
import { fakeDisk } from '../../../../support/editor-disk';

afterEach(() => {
  vi.restoreAllMocks();
});

function ids(place = 0): readonly string[] {
  return editorState().groups[place]?.tabs.map((tab) => tab.id) ?? [];
}

function group(place = 0): string {
  return editorState().groups[place]?.id ?? '';
}

describe('preview tabs — plan 07, B-50', () => {
  it('opens a preview, reading a text kind into the buffer the editor shares (S-312)', async () => {
    fakeDisk(FOLDER, { 'a.md': '# A' });
    openPreview(FOLDER, 'a.md');

    expect(ids()).toEqual(['preview:a.md']);
    await vi.waitFor(() => {
      expect(editorState().docs['a.md']?.pending).toBe('# A');
    });
    expect(editorState().recent).toEqual(['a.md']);

    openPreview(FOLDER, 'b.png', { toSide: true });
    expect(editorState().docs['b.png']).toBeUndefined();
    expect(ids(1)).toEqual(['preview:b.png']);
  });

  it('toggles a tab between the editor and the preview in its place — or brings the other face that is there', () => {
    fakeDisk(FOLDER, { 'a.md': '# A', 'b.ts': 'b' });
    openFile(FOLDER, 'a.md');
    openFile(FOLDER, 'b.ts');

    togglePreview(FOLDER, group(), 'file:a.md');
    expect(ids()).toEqual(['preview:a.md', 'file:b.ts']);
    expect(editorState().groups[0]?.active).toBe('preview:a.md');

    togglePreview(FOLDER, group(), 'preview:a.md');
    expect(ids()).toEqual(['file:a.md', 'file:b.ts']);

    openPreview(FOLDER, 'a.md');
    togglePreview(FOLDER, group(), 'file:a.md');
    expect(ids()).toEqual(['file:a.md', 'preview:a.md', 'file:b.ts']);
    expect(editorState().groups[0]?.active).toBe('preview:a.md');

    // Nothing to toggle: a diff, a tab that is not there.
    togglePreview(FOLDER, group(), 'missing');
    expect(ids()).toEqual(['file:a.md', 'preview:a.md', 'file:b.ts']);
  });

  it('toggles an image between its picture and its bytes, letting go of what no tab shows', () => {
    fakeDisk(FOLDER, {});
    openFile(FOLDER, 'logo.png');
    expect(ids()).toEqual(['preview:logo.png']);

    togglePreview(FOLDER, group(), 'preview:logo.png');
    expect(ids()).toEqual(['file:logo.png']);
    expect(editorState().docs['logo.png']).toBeDefined();

    togglePreview(FOLDER, group(), 'file:logo.png');
    expect(ids()).toEqual(['preview:logo.png']);
    expect(editorState().docs['logo.png']).toBeUndefined();
  });

  it('keeps an italic preview tab on a double click, follows a move, and reopens as it was', () => {
    fakeDisk(FOLDER, {});
    openPreview(FOLDER, 'docs/a.md', { preview: true });
    expect(editorState().groups[0]?.tabs[0]?.preview).toBe(true);

    keepPreview(FOLDER, group(), 'preview:docs/a.md');
    expect(editorState().groups[0]?.tabs[0]?.preview).toBe(false);

    entryMoved(FOLDER, 'docs', 'notes');
    expect(ids()).toEqual(['preview:notes/a.md']);

    closeNow(FOLDER, group(), ['preview:notes/a.md']);
    reopenClosed(FOLDER);
    expect(ids()).toEqual(['preview:notes/a.md']);

    openFile(FOLDER, 'x.bin');
    closeNow(FOLDER, group(), ['file:x.bin']);
    reopenClosed(FOLDER);
    expect(ids()).toContain('file:x.bin');
  });

  it('offers the commands of the previews only for a file that has one', () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'a.md': '# A' });
    const commands = previewCommands(FOLDER);
    const available = () => commands.map((command) => command.when?.() ?? true);
    const run = (id: string) => void commands.find((command) => command.id === id)?.run();

    expect(activePathTab(FOLDER)).toBeNull();
    expect(available()).toEqual([false, false, false]);
    run('editor.openPreview');
    run('editor.togglePreview');
    expect(ids()).toEqual([]);

    openFile(FOLDER, 'a.ts');
    expect(available()).toEqual([false, false, false]);

    openFile(FOLDER, 'a.md');
    expect(available()).toEqual([true, true, true]);
    run('editor.openPreviewToSide');
    expect(ids(1)).toEqual(['preview:a.md']);
    expect(available()).toEqual([false, false, true]);
  });
});

describe('the commands of the PDF reader — plan 21, S-14', () => {
  it('act on the reader reached last, and on none when there is none', () => {
    const commands = pdfReaderCommands();
    const reader = { zoomIn: vi.fn(), zoomOut: vi.fn(), zoomReset: vi.fn(), openFind: vi.fn() };

    for (const command of commands) {
      expect(command.when?.()).toBe(false);
      void command.run();
    }
    expect(reader.zoomIn).not.toHaveBeenCalled();

    reachPdfReader(reader);
    for (const command of commands) {
      expect(command.when?.()).toBe(true);
      void command.run();
    }
    leavePdfReader(reader);

    expect(
      [reader.zoomIn, reader.zoomOut, reader.zoomReset].map((spy) => spy.mock.calls.length),
    ).toEqual([1, 1, 1]);
    expect(commands.flatMap((command) => command.keys ?? []).map((key) => key.context)).toEqual(
      expect.arrayContaining(['pdfReader', 'pdfPointer']),
    );
  });
});
