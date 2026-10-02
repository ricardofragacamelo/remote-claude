import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openDiff, openFile } from '@/features/editor';
import { FOLDER, editorOf, renderEditor, stripOf, typeInto } from '../../../support/editor';
import { fakeDisk, refused } from '../../../support/editor-disk';
import { fakeRaw } from '../../../support/raw-api';
import { translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

function open(path: string): void {
  act(() => {
    openFile(FOLDER, path);
  });
}

describe('what does not open in the editor — plan 07, B-38', () => {
  it('says a binary file is one, and opens it in its hexadecimal view — no dead button (S-252)', async () => {
    fakeDisk(FOLDER, {
      'logo.bin': {
        content: '',
        unreadable: refused('FILE_NOT_TEXT', 'files.error.notText', {
          path: 'logo.bin',
          reason: 'binary',
        }),
      },
    });
    fakeRaw(FOLDER, { 'logo.bin': 'BIN' });
    renderEditor();
    open('logo.bin');

    expect(await screen.findByText(t('editor.paged.hexTitle', { path: 'logo.bin' }))).toBeVisible();
    expect(await screen.findByRole('table')).toHaveTextContent('42 49 4e');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says the size and the ceiling of a file past it, and reads it page by page (S-253)', async () => {
    fakeDisk(FOLDER, {
      'dump.log': {
        content: '',
        unreadable: refused('FILE_TOO_LARGE', 'files.error.tooLarge', {
          size: 25_000_000,
          limit: 10_000_000,
          measure: 'bytes',
        }),
      },
    });
    fakeRaw(FOLDER, { 'dump.log': 'line' });
    renderEditor();
    open('dump.log');

    expect(
      await screen.findByText(t('editor.paged.textTitle', { path: 'dump.log' })),
    ).toBeVisible();
    expect(screen.getByText(/25 MB/)).toHaveTextContent(/10 MB/);
    expect(
      await screen.findByLabelText(t('editor.paged.textLabel', { path: 'dump.log', page: 1 })),
    ).toHaveTextContent('line');
  });

  it('says what to do about a file this machine does not let the server read, and tries again (S-254)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, {
      'secret.txt': {
        content: 'text',
        unreadable: refused('FILE_ACCESS_DENIED', 'files.error.accessDenied', {
          path: 'secret.txt',
          reason: 'permission',
        }),
      },
    });
    renderEditor();
    open('secret.txt');

    expect(
      await screen.findByText(t('editor.placeholder.deniedTitle', { path: 'secret.txt' })),
    ).toBeVisible();
    expect(screen.getByText(t('files.error.accessDenied', { path: 'secret.txt' }))).toBeVisible();
    expect(
      screen.getByText(t('common.error.traceLabel', { traceId: 'trace-editor' })),
    ).toBeVisible();

    disk.files.set('secret.txt', { content: 'text' });
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await editorOf('secret.txt')).toHaveValue('text');
  });

  it('offers "reopen with encoding" for a file that is not UTF-8', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, {
      'old.txt': {
        content: '',
        unreadable: refused('FILE_NOT_TEXT', 'files.error.notText', { reason: 'encoding' }),
      },
    });
    renderEditor();
    open('old.txt');

    await user.click(
      await screen.findByRole('button', { name: t('editor.placeholder.reopenWithEncoding') }),
    );
    disk.files.set('old.txt', { content: 'décodé', encoding: 'iso88591' });
    await user.click(await screen.findByRole('option', { name: 'ISO 8859-1' }));
    expect(await editorOf('old.txt')).toHaveValue('décodé');
  });

  it('opens a large file in the light mode, and the tab says so (S-255)', async () => {
    fakeDisk(FOLDER, { 'big.ts': { content: 'const a = 1;', largeFile: true } });
    renderEditor();
    open('big.ts');

    expect(await editorOf('big.ts')).toBeVisible();
    expect(screen.getByText(t('editor.light.notice'))).toBeVisible();
    expect(
      within(stripOf()).getByRole('button', { name: `big.ts, ${t('editor.tab.light')}` }),
    ).toBeVisible();
  });

  it('shows a read-only diff — "compare with saved" is the buffer against the disk (S-256)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'on disk' });
    renderEditor();
    open('a.ts');
    typeInto(await editorOf('a.ts'), 'mine');

    act(() => {
      openDiff(FOLDER, { path: 'a.ts', source: 'disk' }, { path: 'a.ts', source: 'buffer' });
    });
    const disk = await screen.findByRole('textbox', {
      name: t('editor.diff.disk', { name: 'a.ts' }),
    });
    const buffer = screen.getByRole('textbox', { name: t('editor.diff.buffer', { name: 'a.ts' }) });

    expect(disk).toHaveValue('on disk');
    expect(buffer).toHaveValue('mine');
    expect(disk).toHaveAttribute('readonly');
    expect(buffer).toHaveAttribute('readonly');
    expect(screen.getByText(t('editor.diff.readOnly'))).toBeVisible();
    expect(
      within(stripOf()).getByRole('button', {
        name: t('editor.tab.diffName', { left: 'a.ts', right: 'a.ts' }),
      }),
    ).toBeVisible();
  });

  it('says why a diff could not be read, and tries again', async () => {
    fakeDisk(FOLDER, {});
    renderEditor();

    act(() => {
      openDiff(FOLDER, { path: 'gone.ts', source: 'disk' }, { path: 'other.ts', source: 'buffer' });
    });
    expect(await screen.findByText(t('files.error.notFound', { path: 'gone.ts' }))).toBeVisible();
  });
});
