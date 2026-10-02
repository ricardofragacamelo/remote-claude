import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { explorerStore, registerExplorer } from '@/features/explorer';
import { releaseFolderTabs } from '@/features/workbench/store/folder-tab.store';
import { wsClient } from '@/shared/api/ws';
import { resetEditorFake } from '../../../support/editor-fake';
import { fakeWatches, renderExplorer, row } from '../../../support/explorer';
import { FakeFolder } from '../../../support/files-api';
import { translator } from '../../../support/render';
import { openWorkbench, tabNamed } from '../../../support/workbench';
import { aTab, aTabServer, projects } from '../../../support/workspace-api';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

const t = translator('en');
const A = `${projects.path}/a`;
const B = `${projects.path}/b`;

let unregister: () => void = () => undefined;

beforeAll(() => {
  unregister = registerExplorer();
});

afterAll(() => {
  unregister();
});

afterEach(() => {
  vi.restoreAllMocks();
  wsClient.close();
  resetEditorFake();
});

/** The workbench of A, the Explorer registered, over a disk with a folder in it. */
async function onA() {
  const mounted = openWorkbench(A, aTabServer([aTab(A), aTab(B)]));
  const disk = new FakeFolder(A, { 'src/a.ts': 'a', 'README.md': 'r' }).install();
  const watches = fakeWatches();
  await screen.findByRole('tree', { name: t('explorer.tree.label') });
  return { ...mounted, disk, watches };
}

describe('the Explorer in the workbench — B-24', () => {
  it('takes over the place plan 06 held, and follows the disk of the tab on screen', async () => {
    const { watches } = await onA();

    expect(screen.queryByText(t('workbench.explorer.placeholder'))).toBeNull();
    expect(await row('src')).toBeVisible();
    expect(watches.held(A)).toBe(1);
    expect(screen.getByRole('region', { name: 'open-editors' })).toHaveAttribute('data-folder', A);
  });

  it('gives back the open folders and the selection after a reload — never the undo stack', async () => {
    const user = userEvent.setup();
    const { unmount } = await onA();
    await user.click(await row('src'));
    await row('a.ts');
    explorerStore(A)
      .getState()
      .pushUndo({ kind: 'create', items: [{ path: 'x', etag: null }] });
    explorerStore(A).getState().setShowHidden(true);

    unmount();
    act(() => {
      releaseFolderTabs();
    });
    vi.restoreAllMocks();

    await onA();
    expect(await row('a.ts')).toBeVisible();
    expect(explorerStore(A).getState().selection).toEqual(['src']);
    expect(explorerStore(A).getState().showHidden).toBe(true);
    expect(explorerStore(A).getState().undo).toEqual([]);
  });

  it('lets go of the Explorer of a tab that is closed', async () => {
    const user = userEvent.setup();
    await onA();
    await user.click(await row('src'));
    await row('a.ts');
    const before = explorerStore(A);

    fireEvent.contextMenu(await tabNamed(/^a/));
    await user.click(await screen.findByRole('menuitem', { name: t('workbench.tabAction.close') }));
    await user.click(await screen.findByRole('button', { name: t('workbench.close.confirm') }));

    await waitFor(() => {
      expect(explorerStore(A)).not.toBe(before);
    });
    expect(explorerStore(A).getState().expanded.has('src')).toBe(false);
  });
});

describe('the help of the Explorer — S-198', () => {
  it.each(['en', 'pt-BR'] as const)(
    'opens from its button, in %s, with its four parts',
    async (locale) => {
      const user = userEvent.setup();
      const tr = translator(locale);
      renderExplorer({ 'a.ts': 'a' }, { locale });
      await row('a.ts');

      await user.click(screen.getByRole('button', { name: tr('explorer.action.help') }));

      const sheet = await screen.findByRole('dialog', {
        name: tr('help.panel.title', { screen: tr('explorer.screen.title') }),
      });
      expect(within(sheet).getByText(tr('explorer.help.what'))).toBeVisible();
      expect(within(sheet).getByText(tr('explorer.help.states'))).toBeVisible();
      expect(within(sheet).getByText(tr('explorer.help.notRecorded'))).toBeVisible();
      const shortcuts = within(sheet).getByRole('region', { name: tr('help.section.shortcuts') });
      expect(within(shortcuts).getByText('F2')).toBeVisible();
      expect(within(shortcuts).getByText(tr('explorer.action.rename'))).toBeVisible();

      await user.click(within(sheet).getByRole('button', { name: tr('help.panel.close') }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    },
  );

  it('opens from the palette too', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a' });
    await row('a.ts');

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(
      within(await screen.findByRole('dialog')).getByRole('combobox'),
      t('explorer.action.help'),
    );
    await user.click(
      await screen.findByRole('option', { name: new RegExp(t('explorer.action.help')) }),
    );

    expect(await screen.findByText(t('explorer.help.what'))).toBeVisible();
  });
});

describe('every control that is only an icon says what it does — S-199', () => {
  it('has a translated name and a tooltip', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a' });
    await row('a.ts');
    const toolbar = screen.getByRole('toolbar', { name: t('explorer.toolbar.label') });

    const buttons = within(toolbar).getAllByRole('button');
    for (const button of buttons) {
      expect(button).toHaveAccessibleName();
    }

    await user.hover(
      within(toolbar).getByRole('button', { name: t('explorer.action.collapseAll') }),
    );
    expect(
      await screen.findByRole('tooltip', { name: t('explorer.action.collapseAll') }),
    ).toBeVisible();
  });
});

describe('accessibility — S-202', () => {
  it('has no violation, with the context menu open', async () => {
    const { container } = renderExplorer({ 'src/a.ts': 'a', 'b.ts': 'b' });
    await row('b.ts');

    expect(await axe(container)).toHaveNoViolations();

    fireEvent.contextMenu(await row('b.ts'));
    const menu = await screen.findByRole('menu', { name: t('explorer.menu.label') });
    expect(await axe(menu)).toHaveNoViolations();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violation, with the delete dialog open', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'b.ts': 'b' });
    const item = await row('b.ts');
    act(() => {
      item.focus();
    });
    await user.keyboard('{Delete}');
    await screen.findByRole('dialog');

    expect(await axe(document.body)).toHaveNoViolations();
  });
});
