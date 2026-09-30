import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { FolderOpen } from 'lucide-react';

import { CommandHost, paletteModes, useCommands } from '@/features/commands';
import type { CommandDeclaration, PaletteModeProps } from '@/features/commands';
import { CommandItem } from '@/shared/components/ui/command';
import { onNotify } from '@/shared/lib/notify';
import type { Notification } from '@/shared/lib/notify';
import { render, translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

function Harness({ declarations }: { readonly declarations: readonly CommandDeclaration[] }) {
  useCommands(declarations);
  return (
    <>
      <button type="button">{t('common.action.retry')}</button>
      <input aria-label={t('palette.dialog.input')} />
    </>
  );
}

const openFolder = vi.fn();
const DECLARED: readonly CommandDeclaration[] = [
  {
    id: 'workspace.openFolder',
    labelKey: 'command.workspace.openFolder',
    category: 'file',
    icon: FolderOpen,
    run: () => {
      openFolder();
    },
    keys: [{ key: 'Mod+O', context: 'global' }],
  },
  {
    id: 'workbench.togglePanel',
    labelKey: 'command.workbench.togglePanel',
    category: 'view',
    run: vi.fn(),
  },
  {
    id: 'workbench.nextFolderTab',
    labelKey: 'command.workbench.nextFolderTab',
    category: 'view',
    when: () => false,
    run: vi.fn(),
  },
];

function mount(declarations: readonly CommandDeclaration[] = DECLARED) {
  return render(
    <>
      <CommandHost />
      <Harness declarations={declarations} />
    </>,
  );
}

function palette(): HTMLElement {
  return screen.getByRole('dialog', { name: t('palette.dialog.title') });
}

function options(): string[] {
  return within(palette())
    .queryAllByRole('option')
    .map((option) => option.textContent ?? '');
}

async function openWithKeys(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
  return screen.findByRole('dialog', { name: t('palette.dialog.title') });
}

describe('the command palette — plan 06, S-123', () => {
  it('opens on Ctrl+Shift+P with the commands, each with its category and its shortcut', async () => {
    const user = userEvent.setup();
    mount();

    await openWithKeys(user);

    expect(screen.getByRole('combobox', { name: t('palette.dialog.input') })).toHaveValue('>');
    expect(options()).toEqual([
      'File: Open folder…Ctrl+O',
      'View: Show all commandsCtrl+Shift+P',
      'View: Show or hide the panel',
    ]);
  });

  it('narrows by the translated label and by the category', async () => {
    const user = userEvent.setup();
    mount();
    await openWithKeys(user);
    const field = screen.getByRole('combobox', { name: t('palette.dialog.input') });

    await user.type(field, ' folder');
    expect(options()).toEqual(['File: Open folder…Ctrl+O']);

    await user.clear(field);
    await user.type(field, '>view');
    expect(options()).toHaveLength(2);

    await user.type(field, ' nothing like it');
    expect(within(palette()).getByText(t('palette.commands.noMatch'))).toBeVisible();
  });

  it('does not offer a command that cannot run now', async () => {
    const user = userEvent.setup();
    mount();
    await openWithKeys(user);

    expect(options().some((option) => option.includes(t('command.workbench.nextFolderTab')))).toBe(
      false,
    );
  });

  it('runs the one picked, and closes', async () => {
    const user = userEvent.setup();
    mount();
    await openWithKeys(user);

    await user.type(screen.getByRole('combobox'), ' open{Enter}');

    await waitFor(() => {
      expect(openFolder).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs one picked with the pointer too', async () => {
    const user = userEvent.setup();
    mount();
    await openWithKeys(user);
    openFolder.mockClear();

    await user.click(within(palette()).getByRole('option', { name: /Open folder/ }));

    await waitFor(() => {
      expect(openFolder).toHaveBeenCalledTimes(1);
    });
  });

  it('opens on F1 as well, and from inside a text field — S-120', async () => {
    const user = userEvent.setup();
    mount();

    screen.getByRole('textbox', { name: t('palette.dialog.input') }).focus();
    await user.keyboard('{F1}');

    expect(await screen.findByRole('dialog', { name: t('palette.dialog.title') })).toBeVisible();
  });

  it('has no accessibility violation', async () => {
    const user = userEvent.setup();
    const { baseElement } = mount();
    await openWithKeys(user);

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

describe('opening it twice, and closing it — plan 06, S-125', () => {
  it('opens one palette however often it is asked, and keeps what was typed', async () => {
    const user = userEvent.setup();
    mount();
    await openWithKeys(user);
    await user.type(screen.getByRole('combobox'), ' fold');

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('combobox')).toHaveValue('> fold');
  });

  it('closes on Esc and gives the focus back to whoever had it', async () => {
    const user = userEvent.setup();
    mount();
    const opener = screen.getByRole('button', { name: t('common.action.retry') });
    opener.focus();

    await openWithKeys(user);
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(opener).toHaveFocus();
  });
});

describe('a command that fails from the palette — plan 06, S-126', () => {
  it('becomes a translated notification, and the palette is already closed', async () => {
    const user = userEvent.setup();
    const told: Notification[] = [];
    const stop = onNotify((notification) => told.push(notification));
    mount([
      {
        id: 'broken.one',
        labelKey: 'command.workbench.togglePanel',
        category: 'view',
        run: () => {
          throw new Error('boom');
        },
      },
    ]);
    await openWithKeys(user);

    await user.type(screen.getByRole('combobox'), ' panel{Enter}');

    await waitFor(() => {
      expect(told).toHaveLength(1);
    });
    expect(told[0]).toEqual({
      severity: 'error',
      messageKey: 'notification.command.failed',
      params: { command: t('command.workbench.togglePanel'), code: 'INTERNAL_ERROR' },
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    stop();
  });
});

describe('the modes of the palette — plan 06, S-124', () => {
  function Symbols({ query, pick }: PaletteModeProps): React.JSX.Element {
    return (
      <CommandItem
        value="symbol"
        onSelect={() => {
          pick(() => undefined);
        }}
      >
        {query}
      </CommandItem>
    );
  }

  it('changes with what is typed first, for a mode another plan registered', async () => {
    const user = userEvent.setup();
    const remove = paletteModes.register({
      id: 'symbols',
      position: 300,
      prefix: '@',
      placeholderKey: 'workspace.recentMode.placeholder',
      component: Symbols,
    });
    mount();
    await openWithKeys(user);
    const field = screen.getByRole('combobox');

    await user.clear(field);
    await user.type(field, '@render');
    expect(options()).toEqual(['render']);
    expect(field).toHaveAttribute('placeholder', t('workspace.recentMode.placeholder'));

    await user.clear(field);
    await user.type(field, 'plain');
    expect(
      within(palette()).getByText(t('palette.dialog.noMode', { prefixes: '> @' })),
    ).toBeVisible();
    expect(field).toHaveAttribute('placeholder', t('palette.dialog.placeholder'));
    remove();
  });
});
