import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  answerRecreate,
  answerSensitive,
  compareWithDisk,
  discardAndReload,
  overwrite,
} from '@/features/editor/hooks/answers';
import { revalidate } from '@/features/editor/hooks/documents';
import {
  autoSave,
  createAndOpen,
  recreate,
  save,
  saveAll,
  saveAndClose,
  saveAs,
} from '@/features/editor/hooks/saving';
import { closeTabs, openDiff } from '@/features/editor/hooks/tabs';
import { isDirty } from '@/features/editor/store/editor.store';
import { useEditorPreferences } from '@/features/editor/store/preferences.store';
import { FOLDER, editorState, openedModel } from '../../../../support/editor';
import { fakeDisk, refused, versionOf } from '../../../../support/editor-disk';

afterEach(() => {
  vi.restoreAllMocks();
});

const doc = (path: string) => editorState().docs[path];

describe('saving — plan 07, B-34', () => {
  it('sends nothing for a file with no change (S-226)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    await openedModel('a.ts');

    await expect(save(FOLDER, 'a.ts')).resolves.toEqual({ outcome: 'unchanged' });
    await expect(save(FOLDER, 'nope.ts')).resolves.toEqual({ outcome: 'unchanged' });
    expect(disk.saves()).toEqual([]);
  });

  it('saves one at a time: the second waits and goes with the version the first left (S-227)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');
    const first = disk.versionOf('a.ts');

    disk.hold('PUT');
    model.setValue('two');
    const saving = save(FOLDER, 'a.ts');
    await vi.waitFor(() => {
      expect(disk.saves()).toHaveLength(1);
    });
    model.setValue('three');
    const again = save(FOLDER, 'a.ts');
    await Promise.resolve();
    expect(disk.saves()).toHaveLength(1);
    disk.release();

    await expect(saving).resolves.toEqual({ outcome: 'saved' });
    await expect(again).resolves.toEqual({ outcome: 'saved' });
    expect(disk.saves().map((call) => [call.body?.['content'], call.headers['if-match']])).toEqual([
      ['two', first],
      ['three', versionOf('two')],
    ]);
    expect(isDirty(doc('a.ts'))).toBe(false);
  });

  it('shows the conflict when the disk changed, and overwrites only over the version it was told (S-228, S-229)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    disk.write('a.ts', 'claude');
    model.setValue('mine');
    await expect(save(FOLDER, 'a.ts')).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'FILE_CHANGED' },
    });
    expect(doc('a.ts')?.conflict).toEqual({ currentEtag: disk.versionOf('a.ts'), asking: true });
    expect(isDirty(doc('a.ts'))).toBe(true);

    // The disk changes again before "Overwrite": a new 412, never a blind write.
    disk.write('a.ts', 'claude again');
    await overwrite(FOLDER, 'a.ts');
    expect(disk.files.get('a.ts')?.content).toBe('claude again');
    expect(doc('a.ts')?.conflict?.currentEtag).toBe(disk.versionOf('a.ts'));

    await overwrite(FOLDER, 'a.ts');
    expect(disk.files.get('a.ts')?.content).toBe('mine');
    expect(doc('a.ts')?.conflict).toBeNull();
    expect(isDirty(doc('a.ts'))).toBe(false);
    await overwrite(FOLDER, 'a.ts');
  });

  it('compares and reloads from the conflict', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    disk.write('a.ts', 'claude');
    model.setValue('mine');
    await save(FOLDER, 'a.ts');
    compareWithDisk(FOLDER, 'a.ts');
    expect(doc('a.ts')?.conflict?.asking).toBe(false);
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toContain(
      'diff:disk:a.ts|buffer:a.ts',
    );

    await discardAndReload(FOLDER, 'a.ts');
    expect(model.getValue()).toBe('claude');
    expect(doc('a.ts')?.conflict).toBeNull();
    expect(isDirty(doc('a.ts'))).toBe(false);
  });

  it('keeps the buffer dirty with the error when the disk refuses (S-230)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    for (const error of [
      refused('FILE_ACCESS_DENIED', 'files.error.accessDenied', { reason: 'permission' }),
      refused('FILE_TOO_LARGE', 'files.error.tooLarge', { limit: 10 }),
      refused('STORAGE_FULL', 'files.error.storageFull'),
    ]) {
      disk.refuseSaves(error);
      model.setValue(`edit ${error.code}`);
      await expect(save(FOLDER, 'a.ts')).resolves.toMatchObject({ outcome: 'failed', error });
      expect(doc('a.ts')?.saveError).toBe(error);
      expect(isDirty(doc('a.ts'))).toBe(true);
    }

    expect(disk.files.get('a.ts')?.content).toBe('one');
  });

  it('asks the second step of a sensitive file, sends nothing when cancelled, and confirms (S-232)', async () => {
    const disk = fakeDisk(FOLDER, { '.mcp.json': '{}' });
    const model = await openedModel('.mcp.json');

    model.setValue('{"a":1}');
    await expect(save(FOLDER, '.mcp.json')).resolves.toEqual({ outcome: 'asked' });
    expect(doc('.mcp.json')?.sensitiveAsked).toBe(true);
    expect(disk.saves()).toEqual([]);

    await answerSensitive(FOLDER, '.mcp.json', false);
    expect(doc('.mcp.json')?.sensitiveAsked).toBe(false);
    expect(disk.saves()).toEqual([]);

    await save(FOLDER, '.mcp.json');
    await answerSensitive(FOLDER, '.mcp.json', true);
    expect(disk.saves()[0]?.body?.['confirmSensitive']).toBe(true);
    expect(disk.files.get('.mcp.json')?.content).toBe('{"a":1}');
  });

  it('asks the second step when the server says a file is sensitive that the list did not know', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    disk.refuseSaves(
      refused('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
        reason: 'sensitiveFile',
      }),
    );
    model.setValue('two');
    await save(FOLDER, 'a.ts');
    expect(doc('a.ts')?.sensitiveAsked).toBe(true);
  });

  it('writes only what the adjustments that are on change (S-237)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');
    useEditorPreferences.getState().set('trimTrailingWhitespace', true);
    useEditorPreferences.getState().set('insertFinalNewline', true);

    model.setValue('two  \nthree');
    await save(FOLDER, 'a.ts');

    expect(disk.files.get('a.ts')?.content).toBe('two\nthree\n');
    expect(model.getValue()).toBe('two\nthree\n');
    expect(isDirty(doc('a.ts'))).toBe(false);
  });

  it('saves with another encoding, and keeps the one it had when the text does not fit (S-249, S-250)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.txt': 'café' });
    await openedModel('a.txt');

    disk.refuseSaves(
      refused('FILE_NOT_ENCODABLE', 'files.error.notEncodable', { encoding: 'shiftjis' }),
    );
    await save(FOLDER, 'a.txt', { encoding: 'shiftjis' });
    expect(doc('a.txt')?.encoding).toBe('utf8');
    expect(doc('a.txt')?.saveError?.code).toBe('FILE_NOT_ENCODABLE');

    await save(FOLDER, 'a.txt', { encoding: 'windows1252' });
    expect(disk.saves().at(-1)?.body?.['encoding']).toBe('windows1252');
    expect(doc('a.txt')?.encoding).toBe('windows1252');
  });
});

describe('a file deleted on disk — plan 07, S-240', () => {
  it('offers to recreate it on save, never a silent save, and recreates with a create', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    disk.remove('a.ts');
    await revalidate(FOLDER, 'a.ts');
    expect(doc('a.ts')?.deleted).toBe(true);

    await expect(save(FOLDER, 'a.ts')).resolves.toEqual({ outcome: 'asked' });
    expect(doc('a.ts')?.recreateAsked).toBe(true);
    expect(disk.saves()).toEqual([]);

    await answerRecreate(FOLDER, 'a.ts', false);
    expect(doc('a.ts')?.recreateAsked).toBe(false);

    model.setValue('again');
    await answerRecreate(FOLDER, 'a.ts', true);
    expect(disk.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    expect(disk.files.get('a.ts')?.content).toBe('again');
    expect(doc('a.ts')).toMatchObject({ deleted: false, etag: disk.versionOf('a.ts') });
  });

  it('offers to recreate from "Overwrite" when the conflict was a deletion', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    disk.remove('a.ts');
    model.setValue('mine');
    await save(FOLDER, 'a.ts');
    expect(doc('a.ts')?.conflict).toEqual({ currentEtag: null, asking: true });

    await overwrite(FOLDER, 'a.ts');
    expect(doc('a.ts')).toMatchObject({ conflict: null, deleted: true, recreateAsked: true });
  });

  it('keeps the buffer when recreating is refused, and leaves an unopened file alone', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    await openedModel('a.ts');

    disk.write('a.ts', 'back');
    await expect(recreate(FOLDER, 'a.ts')).resolves.toMatchObject({
      outcome: 'failed',
      error: { code: 'FILE_EXISTS' },
    });
    expect(doc('a.ts')?.saveError?.code).toBe('FILE_EXISTS');
    await expect(recreate(FOLDER, 'nope.ts')).resolves.toEqual({ outcome: 'unchanged' });
  });
});

describe('save as — plan 07, S-233', () => {
  it('writes the buffer at a new path with a create, and the tab follows it', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    model.setValue('copy');
    await expect(saveAs(FOLDER, 'a.ts', 'b.ts')).resolves.toEqual({ outcome: 'saved' });

    expect(disk.files.get('b.ts')?.content).toBe('copy');
    expect(disk.files.get('a.ts')?.content).toBe('one');
    expect(editorState().docs['a.ts']).toBeUndefined();
    expect(isDirty(doc('b.ts'))).toBe(false);
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual(['file:b.ts']);
    expect(editorState().recent[0]).toBe('b.ts');
    expect(editorState().saveAs).toBeNull();
  });

  it('offers to replace a path that is taken, over the version there', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one', 'b.ts': 'theirs' });
    const model = await openedModel('a.ts');
    await openedModel('b.ts');
    const theirs = disk.versionOf('b.ts');

    model.setValue('mine');
    await expect(saveAs(FOLDER, 'a.ts', 'b.ts')).resolves.toEqual({ outcome: 'asked' });
    expect(editorState().saveAs).toEqual({
      path: 'a.ts',
      taken: { path: 'b.ts', etag: theirs },
      failure: null,
    });

    await saveAs(FOLDER, 'a.ts', 'b.ts', { replace: theirs });
    expect(disk.saves().at(-1)?.headers['if-match']).toBe(theirs);
    expect(disk.files.get('b.ts')?.content).toBe('mine');
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual(['file:b.ts']);
  });

  it('says why it could not, and saves in place when the path is the same', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    await openedModel('a.ts');

    await saveAs(FOLDER, 'a.ts', '../x.ts', { replace: '"v"' });
    expect(editorState().saveAs?.failure?.code).toBe('FILE_CHANGED');
    await expect(saveAs(FOLDER, 'a.ts', 'a.ts', { replace: null })).resolves.toMatchObject({
      outcome: 'asked',
    });
    await expect(saveAs(FOLDER, 'nope.ts', 'x.ts')).resolves.toEqual({ outcome: 'unchanged' });
    expect(disk.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });
});

describe('save all — plan 07, S-234', () => {
  it('saves only the dirty files, one by one, and reports each', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c', '.mcp.json': '{}' });
    const a = await openedModel('a.ts');
    await openedModel('b.ts');
    const c = await openedModel('c.ts');
    const mcp = await openedModel('.mcp.json');

    a.setValue('a2');
    c.setValue('c2');
    mcp.setValue('{ }');
    disk.write('c.ts', 'claude');
    const report = await saveAll(FOLDER);

    expect(report).toEqual([
      { path: 'a.ts', saved: true, reasonKey: null, params: { path: 'a.ts' } },
      expect.objectContaining({ path: 'c.ts', saved: false, reasonKey: 'files.error.changed' }),
      {
        path: '.mcp.json',
        saved: false,
        reasonKey: 'editor.saveAll.needsAnswer',
        params: { path: '.mcp.json' },
      },
    ]);
    expect(disk.saves().map((call) => call.path)).toEqual(['a.ts', 'c.ts']);
    expect(editorState().saveReport).toBe(report);
  });
});

describe('the auto-save — plan 07, S-236', () => {
  it('saves a dirty file, and leaves alone one with a question or one that is sensitive', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a', '.mcp.json': '{}' });
    const a = await openedModel('a.ts');
    const mcp = await openedModel('.mcp.json');

    mcp.setValue('{ }');
    autoSave(FOLDER, '.mcp.json');
    a.setValue('a2');
    disk.write('a.ts', 'claude');
    autoSave(FOLDER, 'a.ts');
    await vi.waitFor(() => {
      expect(doc('a.ts')?.conflict).not.toBeNull();
    });

    a.setValue('a3');
    autoSave(FOLDER, 'a.ts');
    await save(FOLDER, 'a.ts', { automatic: true });
    expect(disk.saves().map((call) => call.path)).toEqual(['a.ts']);
    expect(doc('.mcp.json')?.sensitiveAsked).toBe(false);
  });
});

describe('closing with unsaved changes — plan 07, S-210', () => {
  it('"Save" saves each file and closes only when all were saved', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    const a = await openedModel('a.ts');
    const b = await openedModel('b.ts');
    const group = editorState().groups[0]?.id ?? '';

    a.setValue('a2');
    closeTabs(FOLDER, group, ['file:a.ts']);
    await saveAndClose(FOLDER);
    expect(disk.files.get('a.ts')?.content).toBe('a2');
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual(['file:b.ts']);

    b.setValue('b2');
    disk.write('b.ts', 'claude');
    closeTabs(FOLDER, group, ['file:b.ts']);
    await saveAndClose(FOLDER);
    expect(editorState().closing).toBeNull();
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual(['file:b.ts']);
    expect(doc('b.ts')?.conflict).not.toBeNull();
    await saveAndClose(FOLDER);
  });
});

describe('a new file from the empty editor — plan 07, S-266', () => {
  it('is made empty and opened — never over one that is there', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a' });

    await createAndOpen(FOLDER, 'new.ts');
    expect(disk.files.get('new.ts')?.content).toBe('');
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual(['file:new.ts']);
    await expect(createAndOpen(FOLDER, 'a.ts')).rejects.toMatchObject({ code: 'FILE_EXISTS' });
    await createAndOpen(FOLDER, '.mcp.json');
    expect(
      disk.calls.filter((call) => call.method === 'POST').at(-1)?.body?.['confirmSensitive'],
    ).toBe(true);
  });
});

describe('save as, at its edges', () => {
  it('replaces the file in place when the path is its own', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    model.setValue('two');
    await saveAs(FOLDER, 'a.ts', 'a.ts', { replace: disk.versionOf('a.ts') });
    expect(disk.files.get('a.ts')?.content).toBe('two');
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual(['file:a.ts']);
  });

  it('lets go of the buffer a diff kept of the path it writes over', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one', 'b.ts': 'theirs' });
    const model = await openedModel('a.ts');
    await openedModel('b.ts');
    openDiff(FOLDER, { path: 'b.ts', source: 'disk' }, { path: 'b.ts', source: 'buffer' });

    model.setValue('mine');
    await saveAs(FOLDER, 'a.ts', 'b.ts', { replace: disk.versionOf('b.ts') });
    expect(editorState().docs['b.ts']?.model).toBe(model);
  });
});
