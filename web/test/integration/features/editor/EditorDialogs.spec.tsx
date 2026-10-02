import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useCommands } from '@/features/commands';
import { openDiff, openFile } from '@/features/editor';
import { FilePlaceholder } from '@/features/editor/components/FilePlaceholder';
import { RecentFilesMenu } from '@/features/editor/components/RecentFilesMenu';
import { RecentFilesMode } from '@/features/editor/components/RecentFilesMode';
import { REVEAL_IN_EXPLORER } from '@/features/editor/hooks/useEditorCommands';
import { aDocument, editorStoreOf, updateDoc } from '@/features/editor/store/editor.store';
import { useEditorUi } from '@/features/editor/store/ui.store';
import { Command, CommandList } from '@/shared/components/ui/command';
import {
  Menubar,
  MenubarContent,
  MenubarMenu,
  MenubarTrigger,
} from '@/shared/components/ui/menubar';
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
import { render, translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

async function opened(path: string, name = path): Promise<HTMLTextAreaElement> {
  act(() => {
    openFile(FOLDER, path);
  });
  return editorOf(name);
}

describe('the questions of the editor, answered with Esc — plan 07, S-268', () => {
  it('keeps the tabs of a close question, asked for several files', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    typeInto(await opened('a.ts'), 'a2');
    typeInto(await opened('b.ts'), 'b2');

    await user.pointer({
      keys: '[MouseRight]',
      target: within(stripOf()).getByRole('button', { name: `b.ts, ${t('editor.tab.dirty')}` }),
    });
    await user.click(await screen.findByRole('menuitem', { name: t('editor.tabMenu.closeAll') }));
    expect(
      await screen.findByRole('dialog', { name: t('editor.close.titleMany', { count: 2 }) }),
    ).toBeVisible();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(editorState().groups[0]?.tabs).toHaveLength(2);
  });

  it('sends nothing for the second step dismissed, and says what a file the server named controls', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'hooks.json': '{}' });
    renderEditor();
    const area = await opened('hooks.json');

    disk.refuseSaves(
      refused('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
        reason: 'sensitiveFile',
      }),
    );
    typeInto(area, '{"a":1}');
    pressSave(area);
    const dialog = await screen.findByRole('dialog', {
      name: t('editor.sensitive.title', { path: 'hooks.json' }),
    });
    expect(within(dialog).getByText(t('editor.sensitive.claudeSettings'))).toBeVisible();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(disk.files.get('hooks.json')?.content).toBe('{}');
  });

  it('leaves a deleted file deleted when "recreate" is dismissed, and warns for a sensitive one', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { '.mcp.json': '{}' });
    renderEditor();
    const area = await opened('.mcp.json');

    disk.remove('.mcp.json');
    act(() => {
      updateDoc(editorStoreOf(FOLDER), '.mcp.json', () => ({ deleted: true }));
    });
    typeInto(area, '{ }');
    pressSave(area);
    const dialog = await screen.findByRole('dialog', {
      name: t('editor.recreate.title', { name: '.mcp.json' }),
    });
    expect(within(dialog).getByText(t('editor.sensitive.warning'))).toBeVisible();
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(disk.files.has('.mcp.json')).toBe(false);
  });

  it('closes "Save as" and "New file" with Esc, writing nothing', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();

    await user.click(screen.getByRole('button', { name: t('editor.empty.newFile') }));
    await screen.findByRole('dialog', { name: t('editor.newFile.title') });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    const area = await opened('a.ts');
    press(area, { key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true });
    await screen.findByRole('dialog', { name: t('editor.saveAs.title') });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(disk.calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });

  it('does not replace a taken path from Enter, and says why "Save as" failed', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    const area = await opened('a.ts');

    press(area, { key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: t('editor.saveAs.title') });
    const field = within(dialog).getByRole('textbox', { name: t('editor.saveAs.path') });
    await user.clear(field);
    await user.type(field, 'b.ts{Enter}');
    await within(dialog).findByText(t('editor.saveAs.taken', { path: 'b.ts' }));
    await user.type(field, '{Enter}');
    expect(disk.files.get('b.ts')?.content).toBe('b');

    vi.spyOn(
      await import('@/features/editor/services/files.service'),
      'createFile',
    ).mockRejectedValue(refused('INVALID_INPUT', 'files.error.invalidPath'));
    await user.type(field, 'x{Enter}');
    expect(await within(dialog).findByText(t('files.error.invalidPath'))).toBeVisible();
  });
});

describe('the strip, the menu and the status, at their edges', () => {
  it('reveals the file in the explorer from the tab menu, when the explorer registers the command', async () => {
    const user = userEvent.setup();
    const reveal = vi.fn();
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    function Explorer(): null {
      useCommands([
        {
          id: REVEAL_IN_EXPLORER,
          labelKey: 'command.editor.revealInExplorer',
          category: 'view',
          run: reveal,
        },
      ]);
      return null;
    }
    render(<Explorer />);
    renderEditor();
    await opened('a.ts');

    await user.pointer({
      keys: '[MouseRight]',
      target: within(stripOf()).getByRole('button', { name: 'a.ts' }),
    });
    await user.click(await screen.findByRole('menuitem', { name: t('editor.tabMenu.reveal') }));
    await waitFor(() => {
      expect(reveal).toHaveBeenCalledTimes(1);
    });
  });

  it('cannot open a diff to the side, and leaves alone a tab dropped from another folder', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    await opened('a.ts');
    act(() => {
      openDiff(FOLDER, { path: 'a.ts', source: 'disk' }, { path: 'a.ts', source: 'disk' });
    });

    expect(screen.getByRole('button', { name: t('editor.strip.openToSide') })).toBeDisabled();
    const data = {
      getData: () => JSON.stringify({ folder: '/elsewhere', group: 'g', id: 'file:a.ts' }),
    };
    fireEvent.drop(within(stripOf()).getByRole('list'), { dataTransfer: data });
    expect(editorState().groups[0]?.tabs).toHaveLength(2);
  });

  it('goes to a line from the position in the status bar', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    renderEditor();
    const area = await opened('a.ts');
    area.blur();

    await user.click(
      screen.getByRole('button', {
        name: new RegExp(t('editor.status.position', { line: 1, column: 1 })),
      }),
    );
    expect(area).toHaveFocus();
  });
});

describe('the menus of files opened last, with no editor on screen', () => {
  it('say that no file was opened', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>{t('fileMenu.file.title')}</MenubarTrigger>
            <MenubarContent>
              <RecentFilesMenu />
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
        <Command>
          <CommandList>
            <RecentFilesMode query="" pick={vi.fn()} />
          </CommandList>
        </Command>
      </>,
    );

    expect(screen.getByText(t('editor.recent.empty'))).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: t('fileMenu.file.title') }));
    expect(await screen.findAllByText(t('editor.recent.empty'))).toHaveLength(2);
  });
});

describe('"Open recent file" of a folder that opened nothing yet', () => {
  it('says so', async () => {
    const user = userEvent.setup();
    const leave = useEditorUi.getState().mount(FOLDER);
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>{t('fileMenu.file.title')}</MenubarTrigger>
          <MenubarContent>
            <RecentFilesMenu />
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    await user.click(screen.getByRole('menuitem', { name: t('fileMenu.file.title') }));
    expect(await screen.findByText(t('editor.recent.empty'))).toBeVisible();
    leave();
  });
});

describe('a placeholder with less than a failure says something still', () => {
  it('is the unexpected error', () => {
    render(
      <FilePlaceholder
        doc={{ ...aDocument('a.ts'), status: 'failed' }}
        onRetry={vi.fn()}
        onReopenWithEncoding={vi.fn()}
      />,
    );

    expect(screen.getByText(t('common.error.unexpected'))).toBeVisible();
  });
});
