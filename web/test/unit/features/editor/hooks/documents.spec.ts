import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTO_SAVE_DELAY_MS,
  attachModel,
  documentOf,
  diskChanged,
  ensureLoaded,
  letGoOf,
  putRead,
  reloadFromDisk,
  revalidate,
  revalidateAll,
  savedNow,
  setAutoSaver,
  takeRestore,
} from '@/features/editor/hooks/documents';
import { save } from '@/features/editor/hooks/saving';
import { openFile } from '@/features/editor/hooks/tabs';
import { autoSave } from '@/features/editor/hooks/saving';
import { createPlainEngine } from '@/features/editor/lib/plain-engine';
import { PLAIN_TEXT } from '@/features/editor/lib/languages';
import { editorStoreOf, isDirty, updateDoc } from '@/features/editor/store/editor.store';
import { useEditorPreferences } from '@/features/editor/store/preferences.store';
import { FOLDER, editorState, openedModel } from '../../../../support/editor';
import { fakeDisk, refused, versionOf } from '../../../../support/editor-disk';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  setAutoSaver(autoSave);
});

const doc = (path: string) => editorState().docs[path];

describe('reading a file into the editor', () => {
  it('reads it once, with what it is: version, encoding, line endings, indentation', async () => {
    const disk = fakeDisk(FOLDER, {
      'a.ts': { content: 'a\r\n\tb', eol: 'crlf', encoding: 'windows1252' },
    });
    openFile(FOLDER, 'a.ts');
    await vi.waitFor(() => {
      expect(doc('a.ts')?.status).toBe('ready');
    });
    await ensureLoaded(FOLDER, 'a.ts');

    expect(doc('a.ts')).toMatchObject({
      etag: versionOf('a\r\n\tb'),
      encoding: 'windows1252',
      readEol: 'crlf',
      pending: 'a\r\n\tb',
      indentation: { insertSpaces: false, size: 4 },
      language: 'typescript',
    });
    expect(disk.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
    await ensureLoaded(FOLDER, 'not-open.ts');
  });

  it('opens a large file plain, unscanned, in the light mode (S-255)', async () => {
    fakeDisk(FOLDER, { 'big.ts': { content: '  x', largeFile: true } });
    openFile(FOLDER, 'big.ts');
    await vi.waitFor(() => {
      expect(doc('big.ts')?.status).toBe('ready');
    });

    expect(doc('big.ts')).toMatchObject({ light: true, language: PLAIN_TEXT, indentation: null });
  });

  it('says why a file did not open, and reads it again only when asked (B-38)', async () => {
    const binary = refused('FILE_NOT_TEXT', 'files.error.notText', { reason: 'binary' });
    const disk = fakeDisk(FOLDER, { 'a.bin': { content: '', unreadable: binary } });
    openFile(FOLDER, 'a.bin');
    await vi.waitFor(() => {
      expect(doc('a.bin')?.status).toBe('failed');
    });
    expect(doc('a.bin')?.failure).toBe(binary);

    await ensureLoaded(FOLDER, 'a.bin');
    expect(disk.calls).toHaveLength(1);
    disk.files.set('a.bin', { content: 'text now' });
    await ensureLoaded(FOLDER, 'a.bin', true);
    expect(doc('a.bin')?.status).toBe('ready');
  });

  it('turns a failure that is not the server’s into the unexpected error', async () => {
    fakeDisk(FOLDER, {});
    vi.spyOn(
      await import('@/features/editor/services/files.service'),
      'readFile',
    ).mockRejectedValue(new Error('boom'));
    openFile(FOLDER, 'a.ts');
    await vi.waitFor(() => {
      expect(doc('a.ts')?.failure?.code).toBe('INTERNAL_ERROR');
    });
  });
});

describe('the text of a file, in one model for every view — plan 07, S-222', () => {
  it('is made once per adapter, and moved over keeping whether it is dirty', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');
    const plain = createPlainEngine();

    expect(attachModel(FOLDER, 'a.ts', { ...plain, kind: 'plain' })).toBe(model);

    model.setValue('two');
    const moved = attachModel(FOLDER, 'a.ts', { ...plain, kind: 'monaco' });
    expect(moved).not.toBe(model);
    expect(moved?.getValue()).toBe('two');
    expect(isDirty(doc('a.ts'))).toBe(true);
    expect(() => attachModel(FOLDER, 'nope.ts', plain)).toThrow(/not read yet/);
    expect(() => documentOf(FOLDER, 'nope.ts')).toThrow(/not open/);
    expect(documentOf(FOLDER, 'a.ts').path).toBe('a.ts');
  });

  it('pins a preview tab and schedules the auto-save on the first edit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fakeDisk(FOLDER, { 'a.ts': 'one' });
    const saver = vi.fn();
    setAutoSaver(saver);
    useEditorPreferences.getState().set('autoSave', 'afterDelay');
    openFile(FOLDER, 'a.ts', { preview: true });
    await vi.waitFor(() => {
      expect(doc('a.ts')?.status).toBe('ready');
    });
    const model = attachModel(FOLDER, 'a.ts', createPlainEngine());

    model.setValue('two');
    model.setValue('three');
    expect(editorState().groups[0]?.tabs[0]?.preview).toBe(false);
    vi.advanceTimersByTime(AUTO_SAVE_DELAY_MS);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(saver).toHaveBeenCalledWith(FOLDER, 'a.ts');

    model.setLanguage('python');
    useEditorPreferences.getState().set('autoSave', 'off');
    model.setValue('four');
    vi.advanceTimersByTime(AUTO_SAVE_DELAY_MS);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(doc('a.ts')?.language).toBe('python');
  });

  it('stops following a model that is no longer the file’s, and lets go of everything pending', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fakeDisk(FOLDER, { 'a.ts': 'one' });
    const saver = vi.fn();
    setAutoSaver(saver);
    useEditorPreferences.getState().set('autoSave', 'afterDelay');
    const model = await openedModel('a.ts');
    const stale = doc('a.ts');

    updateDoc(editorStoreOf(FOLDER), 'a.ts', () => ({ model: null }));
    model.setValue('ignored');
    expect(doc('a.ts')?.version).toBe(stale?.version);

    if (stale !== undefined) letGoOf(FOLDER, stale);
    vi.advanceTimersByTime(AUTO_SAVE_DELAY_MS);
    expect(saver).not.toHaveBeenCalled();
    letGoOf(FOLDER, { ...(stale ?? doc('a.ts')!), model: null });
  });
});

describe('what the disk changed — plan 07, B-35', () => {
  it('reloads a clean file, keeping the place, with its undo history started over (S-238)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');
    updateDoc(editorStoreOf(FOLDER), 'a.ts', () => ({
      cursor: { line: 1, column: 3 },
      scrollTop: 40,
    }));

    disk.write('a.ts', 'claude');
    await diskChanged(FOLDER, [{ path: 'a.ts', kind: 'changed', origin: 'claude' }], false);

    expect(model.getValue()).toBe('claude');
    expect(model.canUndo()).toBe(false);
    expect(isDirty(doc('a.ts'))).toBe(false);
    expect(takeRestore(FOLDER, 'a.ts')).toEqual({ cursor: { line: 1, column: 3 }, scrollTop: 40 });
    expect(takeRestore(FOLDER, 'a.ts')).toBeUndefined();
  });

  it('warns about a dirty file, with who changed it, and loses nothing (S-239, S-242)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one', 'b.ts': 'b' });
    const model = await openedModel('a.ts');
    const other = await openedModel('b.ts');

    model.setValue('mine');
    other.setValue('mine too');
    disk.write('a.ts', 'claude');
    disk.write('b.ts', 'someone');
    await diskChanged(
      FOLDER,
      [
        { path: 'a.ts', kind: 'changed', origin: 'claude' },
        { path: 'b.ts', kind: 'changed' },
        { path: 'not-open.ts', kind: 'created' },
      ],
      false,
    );

    expect(doc('a.ts')?.external).toEqual({ origin: 'claude' });
    expect(doc('b.ts')?.external).toEqual({ origin: null });
    expect(model.getValue()).toBe('mine');
  });

  it('stays silent on the echo of its own save (S-241) — even one that lands while the save is on its way', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const model = await openedModel('a.ts');

    model.setValue('two');
    disk.hold('PUT');
    const saving = save(FOLDER, 'a.ts');
    await vi.waitFor(() => {
      expect(doc('a.ts')?.saving).toBe(true);
    });
    await diskChanged(FOLDER, [{ path: 'a.ts', kind: 'changed', origin: 'user' }], false);
    disk.release();
    await saving;
    await vi.waitFor(() => {
      expect(disk.calls.filter((call) => call.method === 'GET')).toHaveLength(2);
    });

    await diskChanged(FOLDER, [{ path: 'a.ts', kind: 'changed', origin: 'user' }], false);
    expect(doc('a.ts')?.external).toBeNull();
    expect(model.getValue()).toBe('two');
    savedNow(FOLDER, 'a.ts');
  });

  it('marks a file deleted, and unmarks it when it comes back (S-240)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    await openedModel('a.ts');

    disk.remove('a.ts');
    await diskChanged(FOLDER, [{ path: 'a.ts', kind: 'deleted', origin: 'claude' }], false);
    expect(doc('a.ts')?.deleted).toBe(true);

    disk.write('a.ts', 'one');
    await diskChanged(FOLDER, [{ path: 'a.ts', kind: 'created' }], false);
    expect(doc('a.ts')?.deleted).toBe(false);
  });

  it('checks every open file when more changed than was said, or the socket came back (S-259)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one', 'b.ts': 'b' });
    const a = await openedModel('a.ts');
    await openedModel('b.ts');

    disk.write('a.ts', 'changed');
    await diskChanged(FOLDER, [], true);
    expect(a.getValue()).toBe('changed');

    disk.write('a.ts', 'again');
    await revalidateAll(FOLDER);
    expect(a.getValue()).toBe('again');
  });

  it('leaves a file it cannot ask about alone, and only logs why', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    await openedModel('a.ts');

    disk.files.set('a.ts', {
      content: 'x',
      unreadable: refused('FILE_ACCESS_DENIED', 'files.error.accessDenied'),
    });
    await revalidate(FOLDER, 'a.ts');
    expect(doc('a.ts')).toMatchObject({ deleted: false, external: null });
    await revalidate(FOLDER, 'not-open.ts');
  });

  it('puts a read in a file whose text was not made yet, and ignores a file closed meanwhile', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    openFile(FOLDER, 'a.ts');
    await vi.waitFor(() => {
      expect(doc('a.ts')?.status).toBe('ready');
    });

    disk.write('a.ts', 'two');
    await revalidate(FOLDER, 'a.ts');
    expect(doc('a.ts')?.pending).toBe('two');

    putRead(FOLDER, 'gone.ts', {
      path: 'gone.ts',
      content: '',
      etag: '"x"',
      format: { encoding: 'utf8', bom: false, eol: 'lf' },
      size: 0,
      largeFile: false,
    });
    expect(doc('gone.ts')).toBeUndefined();
  });

  it('answers a revalidation about a file closed while it was asked', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    await openedModel('a.ts');

    disk.hold('GET');
    const asking = revalidate(FOLDER, 'a.ts');
    editorStoreOf(FOLDER).setState({ docs: {} });
    disk.release();
    await asking;
    expect(doc('a.ts')).toBeUndefined();
  });
});

describe('reverting — plan 07, S-235', () => {
  it('drops the buffer for what the disk has, with the encoding it was reopened with', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': { content: 'one', encoding: 'windows1252' } });
    const model = await openedModel('a.ts');

    model.setValue('mine');
    await reloadFromDisk(FOLDER, 'a.ts');
    expect(model.getValue()).toBe('one');
    expect(isDirty(doc('a.ts'))).toBe(false);
    expect(disk.calls.at(-1)?.route).toBe('/files/content');

    disk.files.set('a.ts', {
      content: 'x',
      unreadable: refused('FILE_ACCESS_DENIED', 'files.error.accessDenied'),
    });
    await reloadFromDisk(FOLDER, 'a.ts');
    expect(doc('a.ts')?.saveError?.code).toBe('FILE_ACCESS_DENIED');

    disk.remove('a.ts');
    await reloadFromDisk(FOLDER, 'a.ts');
    expect(doc('a.ts')?.deleted).toBe(true);
    await reloadFromDisk(FOLDER, 'not-open.ts');
  });
});
