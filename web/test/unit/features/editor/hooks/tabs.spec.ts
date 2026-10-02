import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateTab,
  activeFile,
  cancelClose,
  cancelSaveAs,
  closeNow,
  closeTabs,
  discardAndClose,
  dismissSaveReport,
  entryMoved,
  focusGroup,
  forgetTaken,
  keepPreview,
  lostBy,
  moveTab,
  moveTabAcross,
  openDiff,
  openFile,
  reopenClosed,
  setPinned,
  tabsToClose,
} from '@/features/editor/hooks/tabs';
import { editorStoreOf } from '@/features/editor/store/editor.store';
import { FOLDER, editorState, openedModel } from '../../../../support/editor';
import { fakeDisk } from '../../../../support/editor-disk';

afterEach(() => {
  vi.restoreAllMocks();
});

const tabIds = (index = 0) => editorState().groups[index]?.tabs.map((tab) => tab.id) ?? [];
const group = (index = 0) => editorState().groups[index]?.id ?? 'missing';
const disk = (path: string) => ({ path, source: 'disk' as const });

describe('the tabs of a folder tab — plan 07, B-32', () => {
  it('open a file as a preview, replace it with the next one, and keep one that is opened for real (S-209)', () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });

    openFile(FOLDER, 'a.ts', { preview: true });
    openFile(FOLDER, 'b.ts', { preview: true });
    expect(tabIds()).toEqual(['file:b.ts']);

    keepPreview(FOLDER, group(), 'file:b.ts');
    openFile(FOLDER, 'c.ts', { preview: true });
    expect(tabIds()).toEqual(['file:b.ts', 'file:c.ts']);
    expect(editorState().recent).toEqual(['c.ts', 'b.ts', 'a.ts']);
    expect(activeFile(FOLDER)).toBe('c.ts');
  });

  it('are the folder tab’s own: another folder sees none of them (S-12)', () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    openFile(FOLDER, 'a.ts');

    expect(activeFile(`${FOLDER}/pkg`)).toBeNull();
    expect(editorStoreOf(`${FOLDER}/pkg`).getState().docs).toEqual({});
  });

  it('close a clean tab without asking, and ask before losing unsaved changes (S-210, S-211)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    const a = await openedModel('a.ts');
    await openedModel('b.ts');

    closeTabs(FOLDER, group(), ['file:b.ts']);
    expect(tabIds()).toEqual(['file:a.ts']);
    expect(editorState().docs['b.ts']).toBeUndefined();

    a.setValue('mine');
    closeTabs(FOLDER, group(), ['file:a.ts']);
    expect(editorState().closing).toEqual({ group: group(), tabs: ['file:a.ts'], dirty: ['a.ts'] });
    cancelClose(FOLDER);
    expect(tabIds()).toEqual(['file:a.ts']);

    closeTabs(FOLDER, group(), ['file:a.ts']);
    discardAndClose(FOLDER);
    expect(tabIds()).toEqual([]);
    discardAndClose(FOLDER);
    closeTabs(FOLDER, group(), []);
  });

  it('do not ask when the same buffer stays shown in another group (S-222)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    const a = await openedModel('a.ts');
    openFile(FOLDER, 'a.ts', { toSide: true });

    a.setValue('mine');
    expect(lostBy(editorState(), group(1), ['file:a.ts'])).toEqual([]);
    closeTabs(FOLDER, group(1), ['file:a.ts']);
    expect(editorState().groups).toHaveLength(1);
    expect(editorState().docs['a.ts']?.model).toBe(a);
  });

  it('close the others, to the right, the saved ones and all — never a pinned one (S-212)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c', 'd.ts': 'd' });
    for (const path of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) await openedModel(path);
    const c = editorState().docs['c.ts']?.model;
    setPinned(FOLDER, group(), 'file:d.ts', true);
    c?.setValue('dirty');
    openDiff(FOLDER, disk('a.ts'), disk('b.ts'));
    const state = editorState();

    expect(tabIds()).toEqual([
      'file:d.ts',
      'diff:disk:a.ts|disk:b.ts',
      'file:a.ts',
      'file:b.ts',
      'file:c.ts',
    ]);
    expect(tabsToClose(state, group(), 'file:b.ts', 'others')).toEqual([
      'diff:disk:a.ts|disk:b.ts',
      'file:a.ts',
      'file:c.ts',
    ]);
    expect(tabsToClose(state, group(), 'file:b.ts', 'right')).toEqual(['file:c.ts']);
    expect(tabsToClose(state, group(), 'file:b.ts', 'saved')).toEqual([
      'diff:disk:a.ts|disk:b.ts',
      'file:a.ts',
      'file:b.ts',
    ]);
    expect(tabsToClose(state, group(), 'file:b.ts', 'all')).toHaveLength(4);
    expect(tabsToClose(state, 'nope', 'x', 'all')).toEqual([]);

    setPinned(FOLDER, group(), 'file:d.ts', false);
    expect(editorState().groups[0]?.tabs.find((tab) => tab.id === 'file:d.ts')?.pinned).toBe(false);
  });

  it('reopen the last tab closed, in its group, and a diff as a diff (S-212)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    await openedModel('a.ts');
    await openedModel('b.ts');
    openDiff(FOLDER, disk('a.ts'), disk('b.ts'));

    closeNow(FOLDER, group(), ['file:a.ts', 'diff:disk:a.ts|disk:b.ts']);
    expect(tabIds()).toEqual(['file:b.ts']);

    reopenClosed(FOLDER);
    expect(tabIds()).toContain('diff:disk:a.ts|disk:b.ts');
    reopenClosed(FOLDER);
    expect(tabIds()).toContain('file:a.ts');
    reopenClosed(FOLDER);
    expect(editorState().closed).toEqual([]);
  });

  it('move inside a group by index and by one place (S-213), and across groups (S-221)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    for (const path of ['a.ts', 'b.ts', 'c.ts']) openFile(FOLDER, path);

    moveTab(FOLDER, group(), 'file:c.ts', { index: 0 });
    expect(tabIds()).toEqual(['file:c.ts', 'file:a.ts', 'file:b.ts']);
    moveTab(FOLDER, group(), 'file:c.ts', { by: 1 });
    expect(tabIds()).toEqual(['file:a.ts', 'file:c.ts', 'file:b.ts']);

    openFile(FOLDER, 'a.ts', { toSide: true });
    moveTabAcross(FOLDER, group(1), 'file:a.ts', group(0), 0);
    expect(editorState().groups).toHaveLength(1);
  });

  it('activate a tab, and move the focus between groups (S-268)', () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    openFile(FOLDER, 'a.ts');
    openFile(FOLDER, 'b.ts');
    openFile(FOLDER, 'b.ts', { toSide: true });

    activateTab(FOLDER, group(0), 'file:a.ts');
    expect(editorState().activeGroup).toBe(group(0));
    expect(activeFile(FOLDER)).toBe('a.ts');
    focusGroup(FOLDER, 1);
    expect(editorState().activeGroup).toBe(group(1));
    focusGroup(FOLDER, 1);
    expect(editorState().activeGroup).toBe(group(0));
    focusGroup(FOLDER, -1);
    expect(editorState().activeGroup).toBe(group(1));
    focusGroup(FOLDER, group(0));
    expect(editorState().activeGroup).toBe(group(0));
    focusGroup(FOLDER, 'nope');
    expect(editorState().activeGroup).toBe(group(0));
  });
});

describe('a file or directory moved — the explorer tells the editor', () => {
  it('takes every tab of it, or of anything under it, along — buffer and version included', async () => {
    fakeDisk(FOLDER, { 'src/a.ts': 'a', 'src/b.ts': 'b', 'c.ts': 'c' });
    const a = await openedModel('src/a.ts');
    await openedModel('c.ts');
    openDiff(FOLDER, disk('src/b.ts'), disk('c.ts'));
    a.setValue('mine');
    closeNow(FOLDER, group(), ['file:c.ts']);
    const etag = editorState().docs['src/a.ts']?.etag;

    entryMoved(FOLDER, 'src', 'lib');

    expect(tabIds()).toEqual(['file:lib/a.ts', 'diff:disk:lib/b.ts|disk:c.ts']);
    expect(editorState().docs['lib/a.ts']).toMatchObject({ path: 'lib/a.ts', etag, model: a });
    expect(editorState().recent).toEqual(['c.ts', 'lib/a.ts']);
    expect(editorState().groups[0]?.active).toBe('diff:disk:lib/b.ts|disk:c.ts');
    expect(editorState().closed[0]?.tab.id).toBe('file:c.ts');
  });
});

describe('the questions the tabs ask', () => {
  it('put away "Save as", the path taken, and the report of "Save all"', () => {
    const store = editorStoreOf(FOLDER);

    store.setState({ saveAs: { path: 'a', taken: { path: 'b', etag: '"v"' }, failure: null } });
    forgetTaken(FOLDER);
    expect(editorState().saveAs?.taken).toBeNull();
    forgetTaken(FOLDER);
    cancelSaveAs(FOLDER);
    forgetTaken(FOLDER);
    expect(editorState().saveAs).toBeNull();

    store.setState({ saveReport: [] });
    dismissSaveReport(FOLDER);
    expect(editorState().saveReport).toBeNull();
  });
});

describe('the edges of moving and closing', () => {
  it('moves a tab of one group and leaves the others as they are, and closes nothing of a group that is gone', () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    openFile(FOLDER, 'a.ts');
    openFile(FOLDER, 'b.ts');
    openFile(FOLDER, 'a.ts', { toSide: true });

    moveTab(FOLDER, group(0), 'file:b.ts', { by: -1 });
    expect(tabIds(0)).toEqual(['file:b.ts', 'file:a.ts']);
    expect(tabIds(1)).toEqual(['file:a.ts']);

    closeNow(FOLDER, 'gone', ['file:a.ts']);
    expect(tabIds(0)).toEqual(['file:b.ts', 'file:a.ts']);
  });
});
