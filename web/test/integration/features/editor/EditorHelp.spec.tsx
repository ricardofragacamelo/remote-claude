import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { openFile } from '@/features/editor';
import { EDITOR_HELP_PARTS } from '@/features/editor/components/EditorHelp';
import { folderTabStore } from '@/features/workbench/store/folder-tab.store';
import en from '@/shared/i18n/locales/en.json';
import ptBR from '@/shared/i18n/locales/pt-BR.json';
import { FOLDER, editorOf, renderEditor, stripOf, typeInto } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { translator } from '../../../support/render';
import { aViewport } from '../../../support/viewport';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A key of a catalogue, as a person reads it. */
function inCatalogue(catalogue: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      catalogue,
    );
}

describe('the help of the editor — plan 07, B-41', () => {
  it('explains preview, dirty, conflict, change on disk, light mode and binary files, in en and pt-BR (S-264)', () => {
    for (const catalogue of [en, ptBR]) {
      for (const key of EDITOR_HELP_PARTS) {
        expect(typeof inCatalogue(catalogue, key)).toBe('string');
      }
    }

    const what = t('editor.help.what');
    const states = t('editor.help.states');
    expect(what).toMatch(/preview/);
    expect(what).toMatch(/dot/);
    expect(states).toMatch(/overwrite on purpose/);
    expect(states).toMatch(/changes on disk/);
    expect(states).toMatch(/light mode/);
    expect(states).toMatch(/binary files/);
  });

  it('opens from the strip, listing the shortcuts of the registry (S-264, S-265)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
    });
    await editorOf('a.ts');

    await user.click(screen.getByRole('button', { name: t('editor.help.open') }));
    const help = await screen.findByRole('dialog', {
      name: t('help.panel.title', { screen: t('editor.screen.title') }),
    });

    expect(within(help).getByText(t('editor.help.what'))).toBeVisible();
    expect(within(help).getByText('Ctrl+S')).toBeVisible();
    expect(within(help).getByText('Ctrl+K S')).toBeVisible();
    expect(within(help).getByText(t('command.editor.saveAll'))).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('puts the editor’s commands in the palette with their keys (S-265)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
    });
    typeInto(await editorOf('a.ts'), 'b');
    act(() => {
      document.body.focus();
    });

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), t('command.editor.saveAll'));
    const item = await screen.findByRole('option', {
      name: new RegExp(t('command.editor.saveAll')),
    });
    expect(item).toHaveTextContent('Ctrl+K S');
    await user.click(item);
    expect(await screen.findByRole('region', { name: t('editor.saveAll.title') })).toBeVisible();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), t('command.editor.showHelp'));
    await user.click(
      await screen.findByRole('option', { name: new RegExp(t('command.editor.showHelp')) }),
    );
    expect(
      await screen.findByRole('dialog', {
        name: t('help.panel.title', { screen: t('editor.screen.title') }),
      }),
    ).toBeVisible();
  });

  it('teaches the next step when nothing is open: the tree, a new file, the files opened last (S-266)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a', 'taken.ts': '' });
    renderEditor();

    expect(screen.getByText(t('editor.empty.title'))).toBeVisible();
    act(() => {
      folderTabStore(FOLDER).getState().pickView('search');
    });
    await user.click(screen.getByRole('button', { name: t('editor.empty.openFromTree') }));
    expect(folderTabStore(FOLDER).getState()).toMatchObject({
      view: 'explorer',
      sideBarOpen: true,
    });

    await user.click(screen.getByRole('button', { name: t('editor.empty.newFile') }));
    const dialog = await screen.findByRole('dialog', { name: t('editor.newFile.title') });
    const field = within(dialog).getByRole('textbox', { name: t('editor.newFile.path') });
    expect(field).toHaveFocus();
    await user.type(field, 'taken.ts{Enter}');
    expect(
      await within(dialog).findByText(t('files.error.exists', { path: 'taken.ts' })),
    ).toBeVisible();
    await user.clear(field);
    await user.type(field, '.mcp.json');
    expect(within(dialog).getByText(t('editor.sensitive.warning'))).toBeVisible();
    await user.clear(field);
    await user.type(field, 'src/new.ts');
    await user.click(within(dialog).getByRole('button', { name: t('editor.newFile.create') }));
    expect(await editorOf('new.ts')).toBeVisible();
    expect(disk.files.get('src/new.ts')?.content).toBe('');

    await user.click(
      within(stripOf()).getByRole('button', { name: t('editor.tab.close', { name: 'new.ts' }) }),
    );
    const recent = await screen.findByRole('region', { name: t('editor.empty.recent') });
    await user.click(within(recent).getByRole('button', { name: 'new.ts' }));
    expect(await editorOf('new.ts')).toBeVisible();
  });

  it('cancels a new file without making one', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, {});
    renderEditor();

    await user.click(screen.getByRole('button', { name: t('editor.empty.newFile') }));
    const dialog = await screen.findByRole('dialog', { name: t('editor.newFile.title') });
    expect(within(dialog).getByRole('button', { name: t('editor.newFile.create') })).toBeDisabled();
    await user.keyboard('{Enter}');
    await user.click(within(dialog).getByRole('button', { name: t('editor.newFile.cancel') }));
    expect(disk.calls).toEqual([]);
  });

  it('shows the Explorer from the empty editor on a phone, where one view is on screen (S-266)', async () => {
    const user = userEvent.setup();
    aViewport('phone');
    fakeDisk(FOLDER, {});
    renderEditor();

    await user.click(screen.getByRole('button', { name: t('editor.empty.openFromTree') }));
    expect(folderTabStore(FOLDER).getState().mobileView).toBe('explorer');
  });

  it('has no accessibility violation in the editor, its tabs and its dialogs (S-267)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    const { container } = renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts', { toSide: true });
    });
    typeInto(await editorOf('b.ts'), 'mine');

    expect(await axe(container)).toHaveNoViolations();

    await user.click(
      within(stripOf(2)).getByRole('button', {
        name: t('editor.tab.closeDirty', { name: 'b.ts' }),
      }),
    );
    await screen.findByRole('dialog');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
