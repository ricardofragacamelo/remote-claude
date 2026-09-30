import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { CommandHost, FileMenu, useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { MenubarItem } from '@/shared/components/ui/menubar';
import { render, translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

function Declare({ declarations }: { readonly declarations: readonly CommandDeclaration[] }) {
  useCommands(declarations);
  return null;
}

function Recent(): React.JSX.Element {
  return <MenubarItem>{t('workspace.recentMenu.more')}</MenubarItem>;
}

const openFolder = vi.fn();
let canClose = false;

const SHELL: readonly CommandDeclaration[] = [
  {
    id: 'workbench.closeFolderTab',
    labelKey: 'command.workbench.closeFolderTab',
    category: 'file',
    fileMenu: { group: 'close', order: 200 },
    when: () => canClose,
    run: vi.fn(),
  },
  {
    id: 'workspace.openFolder',
    labelKey: 'command.workspace.openFolder',
    category: 'file',
    fileMenu: { group: 'open', order: 100 },
    run: () => {
      openFolder();
    },
    keys: [{ key: 'Mod+O', context: 'global' }],
  },
  {
    id: 'workspace.openRecent',
    labelKey: 'command.workspace.openRecent',
    category: 'file',
    fileMenu: { group: 'open', order: 200, submenu: Recent },
    run: vi.fn(),
  },
  { id: 'palette.other', labelKey: 'command.help.show', category: 'help', run: vi.fn() },
];

function mount(extra: readonly CommandDeclaration[] = [], onPick = vi.fn()) {
  const mounted = render(
    <>
      <CommandHost />
      <Declare declarations={SHELL} />
      <Declare declarations={extra} />
      <FileMenu onPick={onPick} />
    </>,
  );
  return { ...mounted, onPick };
}

function trigger(): HTMLElement {
  return within(screen.getByRole('menubar', { name: t('fileMenu.bar.label') })).getByRole(
    'menuitem',
    { name: t('fileMenu.file.title') },
  );
}

/** The items of the open menu, and the separators between the groups, in order. */
function layout(): string[] {
  return [
    ...screen.getByRole('menu').querySelectorAll('[role="menuitem"], [role="separator"]'),
  ].map((each) => (each.getAttribute('role') === 'separator' ? '—' : (each.textContent ?? '')));
}

describe('the File menu — plan 06, S-127', () => {
  it('comes out of the registry, the groups in order, with the label and shortcut of the palette', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(trigger());

    expect(layout()).toEqual([
      `${t('command.workspace.openFolder')}Ctrl+O`,
      t('command.workspace.openRecent'),
      '—',
      t('command.workbench.closeFolderTab'),
    ]);
  });

  it('disables an item that cannot run now, and enables it when it can', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(trigger());
    expect(
      screen.getByRole('menuitem', { name: t('command.workbench.closeFolderTab') }),
    ).toHaveAttribute('aria-disabled', 'true');

    await user.keyboard('{Escape}');
    canClose = true;
    await user.click(trigger());
    expect(
      screen.getByRole('menuitem', { name: t('command.workbench.closeFolderTab') }),
    ).not.toHaveAttribute('aria-disabled');
    canClose = false;
  });

  it('runs the item picked once the menu has closed, and tells whoever holds it', async () => {
    const user = userEvent.setup();
    const { onPick } = mount();

    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: /Open folder/ }));

    await waitFor(() => {
      expect(openFolder).toHaveBeenCalledTimes(1);
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('has no accessibility violation, open', async () => {
    const user = userEvent.setup();
    const { container } = mount();

    await user.click(trigger());

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('what nobody registered — plan 06, S-128', () => {
  it('is not an item until the plan that owns it registers it, and then is, in its group', async () => {
    const user = userEvent.setup();
    mount([
      {
        id: 'explorer.newFile',
        labelKey: 'command.workbench.togglePanel',
        category: 'file',
        fileMenu: { group: 'new', order: 100 },
        run: vi.fn(),
      },
    ]);

    await user.click(trigger());

    expect(layout()[0]).toBe(t('command.workbench.togglePanel'));
    expect(layout()[1]).toBe('—');
  });

  it('is no menu at all while nothing is registered into it', () => {
    render(<FileMenu />);

    expect(screen.queryByRole('menubar')).toBeNull();
  });
});

describe('the File menu from the keyboard — plan 06, S-129', () => {
  it('opens from its trigger, walks with the arrows, opens the submenu and closes on Esc', async () => {
    const user = userEvent.setup();
    mount();

    trigger().focus();
    await user.keyboard('{ArrowDown}');
    const first = await screen.findByRole('menuitem', { name: /Open folder/ });
    await waitFor(() => {
      expect(first).toHaveFocus();
    });

    await user.keyboard('{ArrowDown}');
    const recent = screen.getByRole('menuitem', { name: t('command.workspace.openRecent') });
    expect(recent).toHaveFocus();
    expect(recent).toHaveAttribute('aria-haspopup', 'menu');

    await user.keyboard('{ArrowRight}');
    expect(
      await screen.findByRole('menuitem', { name: t('workspace.recentMenu.more') }),
    ).toBeVisible();

    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    expect(trigger()).toHaveFocus();
  });
});
