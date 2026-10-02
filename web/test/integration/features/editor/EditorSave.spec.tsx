import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { openFile } from '@/features/editor';
import { useEditorPreferences } from '@/features/editor/store/preferences.store';
import { AUTO_SAVE_DELAY_MS } from '@/features/editor/hooks/documents';
import {
  FOLDER,
  editorOf,
  editorState,
  press,
  pressSave,
  renderEditor,
  stripOf,
  typeInto,
} from '../../../support/editor';
import { fakeDisk, refused } from '../../../support/editor-disk';
import { translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function opened(path: string, name = path): Promise<HTMLTextAreaElement> {
  act(() => {
    openFile(FOLDER, path);
  });
  return editorOf(name);
}

describe('saving — plan 07, B-34', () => {
  it('saves with the version it read, and the tab is clean with the new version (S-225)', async () => {
    const disk = fakeDisk(FOLDER, { 'src/a.ts': 'one\n' });
    renderEditor();
    const area = await opened('src/a.ts', 'a.ts');
    const read = disk.versionOf('src/a.ts');

    typeInto(area, 'two\n');
    expect(
      within(stripOf()).getByRole('button', { name: t('editor.tab.closeDirty', { name: 'a.ts' }) }),
    ).toBeVisible();
    pressSave(area);

    await waitFor(() => {
      expect(disk.files.get('src/a.ts')?.content).toBe('two\n');
    });
    expect(disk.saves()[0]?.headers['if-match']).toBe(read);
    await waitFor(() => {
      expect(editorState().docs['src/a.ts']?.etag).toBe(disk.versionOf('src/a.ts'));
    });
    expect(
      within(stripOf()).getByRole('button', { name: t('editor.tab.close', { name: 'a.ts' }) }),
    ).toBeVisible();
  });

  it('sends nothing when Ctrl+S finds no change (S-226)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');

    pressSave(area);
    // Typed, then undone: the version is the saved one again, and so is the tab.
    typeInto(area, 'two');
    press(area, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(area.value).toBe('one');
    pressSave(area);
    await act(async () => {
      await Promise.resolve();
    });

    expect(disk.saves()).toEqual([]);
  });

  it('asks Compare / Overwrite / Reload on a conflict — the way out first (S-228)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    const { container } = renderEditor();
    const area = await opened('a.ts');

    disk.write('a.ts', 'claude');
    const claude = disk.versionOf('a.ts');
    typeInto(area, 'mine');
    pressSave(area);
    const dialog = await screen.findByRole('dialog', {
      name: t('editor.conflict.title', { name: 'a.ts' }),
    });

    expect(
      within(dialog).getByRole('button', { name: t('editor.conflict.compare') }),
    ).toHaveFocus();
    expect(await axe(container.ownerDocument.body)).toHaveNoViolations();

    await user.click(within(dialog).getByRole('button', { name: t('editor.conflict.compare') }));
    expect(await screen.findByText(t('editor.diff.readOnly'))).toBeVisible();
    // The question waits above the editor of the file, put off but not answered.
    await user.click(
      within(stripOf()).getByRole('button', { name: 'a.ts, ' + t('editor.tab.dirty') }),
    );
    await user.click(await screen.findByRole('button', { name: t('editor.conflict.resolve') }));

    await user.click(await screen.findByRole('button', { name: t('editor.conflict.overwrite') }));
    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('mine');
    });
    // Over the version the 412 brought, on purpose — never blind.
    expect(disk.saves().at(-1)?.headers['if-match']).toBe(claude);
  });

  it('reloads from the conflict, dropping the changes, and Esc puts the question off', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');

    disk.write('a.ts', 'claude');
    typeInto(area, 'mine');
    pressSave(area);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('button', { name: t('editor.conflict.resolve') })).toBeVisible();
    // The focus comes back to the editor the question was about (S-268).
    await waitFor(() => {
      expect(area).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: t('editor.conflict.resolve') }));
    await user.click(await screen.findByRole('button', { name: t('editor.conflict.reload') }));
    await waitFor(() => {
      expect(area.value).toBe('claude');
    });
  });

  it('keeps the buffer dirty with a translated error that says what to do (S-230)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    const area = await opened('a.ts');

    disk.refuseSaves(refused('STORAGE_FULL', 'files.error.storageFull', { path: 'a.ts' }));
    typeInto(area, 'mine');
    pressSave(area);

    const alert = await screen.findByText(t('files.error.storageFull', { path: 'a.ts' }));
    expect(alert).toBeVisible();
    expect(
      within(stripOf()).getByRole('button', { name: t('editor.tab.closeDirty', { name: 'a.ts' }) }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('editor.saveError.dismiss') }));
    expect(screen.queryByText(t('files.error.storageFull', { path: 'a.ts' }))).toBeNull();
  });

  it('asks the second step of a file that changes what Claude may do, saying what it controls (S-232)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { '.claude/settings.json': '{}' });
    renderEditor();
    const area = await opened('.claude/settings.json', 'settings.json');

    typeInto(area, '{"permissions":{}}');
    pressSave(area);
    const dialog = await screen.findByRole('dialog', {
      name: t('editor.sensitive.title', { path: '.claude/settings.json' }),
    });
    expect(within(dialog).getByText(t('editor.sensitive.claudeSettings'))).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: t('editor.sensitive.cancel') }),
    ).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: t('editor.sensitive.cancel') }));
    expect(disk.saves()).toEqual([]);

    pressSave(area);
    await user.click(await screen.findByRole('button', { name: t('editor.sensitive.confirm') }));
    await waitFor(() => {
      expect(disk.saves()[0]?.body?.['confirmSensitive']).toBe(true);
    });
  });

  it('saves as a new path, and offers to replace one that is taken (S-233)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one', 'b.ts': 'theirs' });
    renderEditor();
    const area = await opened('a.ts');

    typeInto(area, 'mine');
    press(area, { key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: t('editor.saveAs.title') });
    const field = within(dialog).getByRole('textbox', { name: t('editor.saveAs.path') });
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, 'b.ts{Enter}');

    expect(
      await within(dialog).findByText(t('editor.saveAs.taken', { path: 'b.ts' })),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t('editor.saveAs.replace') }));
    await waitFor(() => {
      expect(disk.files.get('b.ts')?.content).toBe('mine');
    });
    expect(await editorOf('b.ts')).toBeVisible();
    expect(disk.files.get('a.ts')?.content).toBe('one');
  });

  it('says a path that changes what Claude may do before "Save as" writes it, and why a save as failed', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    await opened('a.ts');

    act(() => {
      editorState();
    });
    press(document.body, { key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: t('editor.saveAs.title') });
    const field = within(dialog).getByRole('textbox', { name: t('editor.saveAs.path') });
    await user.clear(field);
    await user.type(field, '.mcp.json');

    expect(within(dialog).getByText(t('editor.sensitive.warning'))).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: t('editor.saveAs.saveSensitive') }),
    ).toBeEnabled();
    await user.clear(field);
    expect(within(dialog).getByRole('button', { name: t('editor.saveAs.save') })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: t('editor.saveAs.cancel') }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves all with Ctrl+K S, and reports each file (S-234)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    typeInto(await opened('a.ts'), 'a2');
    const b = await opened('b.ts');
    typeInto(b, 'b2');
    disk.write('b.ts', 'claude');

    press(b, { key: 'k', code: 'KeyK', ctrlKey: true });
    press(b, { key: 's', code: 'KeyS' });
    const report = await screen.findByRole('region', { name: t('editor.saveAll.title') });

    expect(within(report).getByRole('heading')).toHaveTextContent(
      t('editor.saveAll.summary', { saved: 1, total: 2 }),
    );
    expect(within(report).getByText(t('editor.saveAll.saved'))).toBeVisible();
    expect(within(report).getByText(t('files.error.changed', { path: 'b.ts' }))).toBeVisible();
    expect(disk.files.get('a.ts')?.content).toBe('a2');
    await user.click(within(report).getByRole('button', { name: t('editor.saveAll.dismiss') }));
    expect(screen.queryByRole('region', { name: t('editor.saveAll.title') })).toBeNull();
  });

  it('saves on its own a second after typing, and when the editor loses the focus (S-236)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    const area = await opened('a.ts');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => {
      useEditorPreferences.getState().set('autoSave', 'afterDelay');
    });
    typeInto(area, 'a2');
    expect(disk.saves()).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SAVE_DELAY_MS);
      await Promise.resolve();
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('a2');
    });

    act(() => {
      useEditorPreferences.getState().set('autoSave', 'onFocusChange');
    });
    typeInto(area, 'a3');
    act(() => {
      area.dispatchEvent(new Event('blur'));
    });
    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('a3');
    });
  });
});
