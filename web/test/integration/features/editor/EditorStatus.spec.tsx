import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openFile } from '@/features/editor';
import {
  FOLDER,
  editorOf,
  editorState,
  pressSave,
  renderEditor,
  stripOf,
} from '../../../support/editor';
import { fakeDisk, refused } from '../../../support/editor-disk';
import { translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

function status(): HTMLElement {
  return screen.getByRole('group', { name: t('editor.status.label') });
}

async function opened(path: string): Promise<HTMLTextAreaElement> {
  act(() => {
    openFile(FOLDER, path);
  });
  return editorOf(path);
}

describe('the status bar of the editor — plan 07, B-37', () => {
  it('shows line and column, the selection, indentation, encoding, line endings and language (S-247)', async () => {
    fakeDisk(FOLDER, { 'a.ts': { content: 'ab\n  cd', encoding: 'windows1252' } });
    renderEditor();
    const area = await opened('a.ts');

    act(() => {
      area.setSelectionRange(4, 6);
      area.dispatchEvent(new Event('select'));
    });

    const bar = status();
    expect(
      within(bar).getByRole('button', {
        name: new RegExp(t('editor.status.position', { line: 2, column: 2 })),
      }),
    ).toHaveTextContent(t('editor.status.selection', { count: 2 }));
    expect(
      within(bar).getByRole('button', {
        name: t('editor.status.indentation', { value: t('editor.status.spaces', { size: 2 }) }),
      }),
    ).toBeVisible();
    expect(
      within(bar).getByRole('button', {
        name: t('editor.status.encoding', { value: 'Windows 1252' }),
      }),
    ).toBeVisible();
    expect(
      within(bar).getByRole('button', { name: t('editor.status.eol', { value: 'LF' }) }),
    ).toBeVisible();
    expect(
      within(bar).getByRole('button', {
        name: t('editor.status.language', { value: 'TypeScript' }),
      }),
    ).toBeVisible();
  });

  it('converts LF to CRLF, which dirties the tab, and the save writes it (S-248)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a\nb' });
    renderEditor();
    const area = await opened('a.ts');

    await user.click(
      within(status()).getByRole('button', { name: t('editor.status.eol', { value: 'LF' }) }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'CRLF' }));
    expect(
      within(stripOf()).getByRole('button', { name: t('editor.tab.closeDirty', { name: 'a.ts' }) }),
    ).toBeVisible();

    pressSave(area);
    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('a\r\nb');
    });
  });

  it('reopens with an encoding, and saves with another one (S-249)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.txt': 'raw' });
    renderEditor();
    const area = await opened('a.txt');

    disk.files.set('a.txt', { content: 'decoded', encoding: 'iso88591' });
    await user.click(
      within(status()).getByRole('button', {
        name: t('editor.status.encoding', { value: 'UTF-8' }),
      }),
    );
    const reopen = await screen.findAllByRole('menuitem', { name: 'ISO 8859-1' });
    await user.click(reopen[0] as HTMLElement);
    await waitFor(() => {
      expect(area.value).toBe('decoded');
    });
    expect(disk.calls.at(-1)?.route).toBe('/files/content');

    await user.click(
      within(status()).getByRole('button', {
        name: t('editor.status.encoding', { value: 'ISO 8859-1' }),
      }),
    );
    const save = await screen.findAllByRole('menuitem', { name: 'UTF-16 LE' });
    await user.click(save[1] as HTMLElement);
    await waitFor(() => {
      expect(disk.saves().at(-1)?.body?.['encoding']).toBe('utf16le');
    });
  });

  it('says in words when the encoding cannot hold the text, and writes nothing (S-250)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.txt': '日本' });
    renderEditor();
    await opened('a.txt');

    disk.refuseSaves(
      refused('FILE_NOT_ENCODABLE', 'files.error.notEncodable', { encoding: 'windows1252' }),
    );
    await user.click(
      within(status()).getByRole('button', {
        name: t('editor.status.encoding', { value: 'UTF-8' }),
      }),
    );
    const save = await screen.findAllByRole('menuitem', { name: 'Windows 1252' });
    await user.click(save[1] as HTMLElement);

    expect(
      await screen.findByText(t('files.error.notEncodable', { encoding: 'windows1252' })),
    ).toBeVisible();
    expect(disk.files.get('a.txt')?.content).toBe('日本');
    expect(editorState().docs['a.txt']?.encoding).toBe('utf8');
  });

  it('converts the indentation and changes the language of the highlighting (S-251)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a\n\tb' });
    renderEditor();
    const area = await opened('a.ts');

    await user.click(
      within(status()).getByRole('button', {
        name: t('editor.status.indentation', { value: t('editor.status.tabs', { size: 4 }) }),
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: t('editor.indentation.toSpaces') }),
    );
    expect(area.value).toBe('a\n    b');

    await user.click(
      within(status()).getByRole('button', {
        name: t('editor.status.language', { value: 'TypeScript' }),
      }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Python' }));
    expect(
      within(status()).getByRole('button', {
        name: t('editor.status.language', { value: 'Python' }),
      }),
    ).toBeVisible();

    await user.click(
      within(status()).getByRole('button', {
        name: t('editor.status.language', { value: 'Python' }),
      }),
    );
    await user.click(await screen.findByRole('menuitem', { name: t('editor.language.plaintext') }));
    expect(
      within(status()).getByRole('button', {
        name: t('editor.status.language', { value: t('editor.language.plaintext') }),
      }),
    ).toBeVisible();
  });

  it('offers the same actions in the palette, the one in use marked', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    await opened('a.ts');

    act(() => {
      document.body.focus();
    });
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), t('command.editor.changeEol'));
    await user.click(
      await screen.findByRole('option', { name: new RegExp(t('command.editor.changeEol')) }),
    );
    expect(await screen.findByRole('group', { name: t('editor.choice.eol') })).toBeVisible();
    await user.type(screen.getByRole('combobox'), 'zzz');
    expect(await screen.findByText(t('editor.choice.none'))).toBeVisible();
    await user.clear(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'CRLF' }));
    await waitFor(() => {
      expect(editorState().docs['a.ts']?.model?.eol()).toBe('crlf');
    });
  });

  it('shows nothing while no file is in an editor', () => {
    fakeDisk(FOLDER, {});
    renderEditor();
    expect(screen.queryByRole('group', { name: t('editor.status.label') })).toBeNull();
  });
});
