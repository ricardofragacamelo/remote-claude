import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { CommandHost } from '@/features/commands';
import { FolderDialogHost, WelcomeScreen } from '@/features/workspace';
import { render, translator } from '../../../support/render';
import {
  aListing,
  fakeWorkspaceApi,
  projects,
  refusal,
  scratch,
} from '../../../support/workspace-api';
import type { RecentDto, WorkspaceRoutes } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

function aRecent(name: string, overrides: Partial<RecentDto> = {}): RecentDto {
  return {
    path: `${projects.path}/${name}`,
    rootLabel: 'Projects',
    lastOpenedAt: '2026-09-29T10:00:00.000Z',
    pinned: false,
    available: true,
    ...overrides,
  };
}

const everything: WorkspaceRoutes = {
  roots: [scratch, projects],
  recent: [
    aRecent('pinned-one', { pinned: true }),
    aRecent('app'),
    aRecent('gone', { available: false }),
    { ...aRecent('elsewhere', { available: false, rootLabel: null }), path: '/opt/elsewhere' },
  ],
  directories: (asked) => aListing(projects, asked.get('path') ?? '', ['app', 'docs']),
  pin: () => undefined,
  forget: () => undefined,
};

function mount(routes: WorkspaceRoutes = everything, locale: 'en' | 'pt-BR' = 'en') {
  const api = fakeWorkspaceApi(routes);
  const onOpen = vi.fn();
  // The dialog and its shortcut are the app's, mounted by the frame (plan 06, D-28).
  const mounted = render(
    <>
      <CommandHost />
      <FolderDialogHost open={onOpen} welcome={vi.fn()} />
      <WelcomeScreen onOpen={onOpen} />
    </>,
    locale,
  );
  return { ...mounted, api, onOpen };
}

/** The list of recent folders, once it has loaded. */
async function recentList(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: t('workspace.recent.title') });
}

describe('the welcome screen — S-69', () => {
  it('offers to open a folder, lists the recent ones and the roots', async () => {
    mount();

    expect(screen.getByRole('button', { name: t('workspace.welcome.openFolder') })).toBeVisible();
    const recent = await recentList();
    const rows = within(recent).getAllByRole('listitem');
    // Pinned first, as the server ordered them — and said so to a screen reader too.
    expect(rows[0]).toHaveTextContent('pinned-one');
    expect(within(rows[0]!).getByText(t('workspace.recent.pinned'))).toBeInTheDocument();

    const roots = await screen.findByRole('list', { name: t('workspace.roots.title') });
    expect(
      within(roots).getByRole('button', {
        name: t('workspace.roots.browse', { label: 'Projects' }),
      }),
    ).toBeVisible();
    expect(within(roots).getByText(scratch.path)).toBeVisible();
  });

  it('marks a folder that can no longer be opened, with the reason and without a link', async () => {
    mount();
    const recent = await recentList();

    const gone = within(recent).getByText('gone').closest('li')!;
    expect(within(gone).getByText(t('workspace.recent.missing'))).toBeVisible();
    expect(within(gone).queryByRole('button', { name: /^gone/ })).toBeNull();

    const elsewhere = within(recent).getByText('elsewhere').closest('li')!;
    expect(within(elsewhere).getByText(t('workspace.recent.notAllowed'))).toBeVisible();
  });

  it('opens a recent folder in one click', async () => {
    const user = userEvent.setup();
    const { onOpen } = mount();

    await user.click(within(await recentList()).getByRole('button', { name: /^app/ }));

    expect(onOpen).toHaveBeenCalledWith(`${projects.path}/app`);
  });
});

describe('managing the recent folders — S-70', () => {
  it('pins and removes from the buttons of the row', async () => {
    const user = userEvent.setup();
    const { api } = mount();
    await recentList();

    await user.click(
      screen.getByRole('button', { name: t('workspace.recent.pin', { name: 'app' }) }),
    );
    await user.click(
      screen.getByRole('button', { name: t('workspace.recent.unpin', { name: 'pinned-one' }) }),
    );
    await user.click(
      screen.getByRole('button', { name: t('workspace.recent.remove', { name: 'gone' }) }),
    );

    expect(api.put.mock.calls.map(([, body]) => body)).toEqual([
      { path: `${projects.path}/app`, pinned: true },
      { path: `${projects.path}/pinned-one`, pinned: false },
    ]);
    expect(api.remove).toHaveBeenCalledWith(
      `/workspaces/recent?${new URLSearchParams({ path: `${projects.path}/gone` }).toString()}`,
    );
  });

  it('does the same from the context menu of the row', async () => {
    const user = userEvent.setup();
    const { api, onOpen } = mount();
    const row = within(await recentList())
      .getByText('app')
      .closest('li')!;

    fireEvent.contextMenu(row.firstElementChild!);
    await user.click(
      await screen.findByRole('menuitem', { name: t('workspace.recent.pin', { name: 'app' }) }),
    );
    expect(api.put).toHaveBeenCalledWith('/workspaces/recent/pin', {
      path: `${projects.path}/app`,
      pinned: true,
    });

    fireEvent.contextMenu(row.firstElementChild!);
    await user.click(await screen.findByRole('menuitem', { name: t('workspace.recent.open') }));
    expect(onOpen).toHaveBeenCalledWith(`${projects.path}/app`);

    fireEvent.contextMenu(row.firstElementChild!);
    await user.click(
      await screen.findByRole('menuitem', { name: t('workspace.recent.remove', { name: 'app' }) }),
    );
    expect(api.remove).toHaveBeenCalledTimes(1);
  });

  it('offers no "Open" in the menu of a folder that cannot be opened', async () => {
    mount();
    const row = within(await recentList())
      .getByText('gone')
      .closest('li')!;

    fireEvent.contextMenu(row.firstElementChild!);

    expect(
      await screen.findByRole('menuitem', { name: t('workspace.recent.remove', { name: 'gone' }) }),
    ).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: t('workspace.recent.open') })).toBeNull();
  });

  it('removes from the keyboard, with Delete on the folder', async () => {
    const user = userEvent.setup();
    const { api } = mount();

    within(await recentList())
      .getByRole('button', { name: /^app/ })
      .focus();
    await user.keyboard('{Delete}');

    expect(api.remove).toHaveBeenCalledTimes(1);
  });
});

describe('a change the server refuses — S-184', () => {
  it('keeps the row as it was, with the reason beside it', async () => {
    const user = userEvent.setup();
    mount({ ...everything, pin: () => refusal('NETWORK_UNREACHABLE', 'common.error.offline') });
    const row = within(await recentList())
      .getByText('app')
      .closest('li')!;

    await user.click(
      within(row).getByRole('button', { name: t('workspace.recent.pin', { name: 'app' }) }),
    );

    expect(await within(row).findByRole('alert')).toHaveTextContent(t('common.error.offline'));
    expect(
      within(row).getByRole('button', { name: t('workspace.recent.pin', { name: 'app' }) }),
    ).toBeEnabled();
  });

  it('holds the buttons of a row while its change is on the way', async () => {
    const user = userEvent.setup();
    mount({ ...everything, pin: () => () => new Promise(() => undefined) });
    const row = within(await recentList())
      .getByText('app')
      .closest('li')!;
    const pin = within(row).getByRole('button', {
      name: t('workspace.recent.pin', { name: 'app' }),
    });

    await user.click(pin);

    expect(pin).toBeDisabled();
    expect(
      within(row).getByRole('button', { name: t('workspace.recent.remove', { name: 'app' }) }),
    ).toBeDisabled();
  });
});

describe('an empty welcome screen — S-71', () => {
  it('teaches the next step when nothing was opened yet, and how to let the project in', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mount({ roots: [scratch], recent: [] });

    expect(await screen.findByText(t('workspace.recent.emptyTitle'))).toBeVisible();
    expect(screen.getByText(t('workspace.recent.emptyDescription'))).toBeVisible();
    expect(screen.getByText(t('workspace.allowlist.command'))).toBeVisible();

    await user.click(screen.getByRole('button', { name: t('workspace.allowlist.copy') }));

    expect(writeText).toHaveBeenCalledWith('pnpm allowlist add <path>');
    expect(
      await screen.findByRole('button', { name: t('workspace.allowlist.copied') }),
    ).toBeVisible();
  });

  it('says to select it by hand when the browser does not let it be copied', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    mount({ roots: [scratch], recent: [] });

    await user.click(await screen.findByRole('button', { name: t('workspace.allowlist.copy') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t('workspace.allowlist.copyFailed'));
  });

  it('says whose allowlist to ask when no root is this user’s — and still says how', async () => {
    mount({ roots: [], recent: [] });

    expect(await screen.findByText(t('workspace.roots.emptyTitle'))).toBeVisible();
    expect(screen.getByText(t('workspace.allowlist.command'))).toBeVisible();
  });

  it('shows the error of a list that could not be read, with a way to try again', async () => {
    const user = userEvent.setup();
    const { api } = mount({
      roots: [scratch],
      recent: refusal('NETWORK_UNREACHABLE', 'common.error.offline'),
    });

    expect(await screen.findByText(t('common.error.offline'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));

    await waitFor(() => {
      expect(api.get.mock.calls.filter(([path]) => path === '/workspaces/recent')).toHaveLength(2);
    });
  });
});

describe('the search in the recent folders — S-185', () => {
  const many = Array.from({ length: 9 }, (_, index) => aRecent(`app${String(index)}`));

  it('is not there while the list fits a screen', async () => {
    mount({ ...everything, recent: many.slice(0, 8) });
    await recentList();

    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('narrows a long list, and says when it finds nothing rather than that there is nothing', async () => {
    const user = userEvent.setup();
    mount({ ...everything, recent: [...many, aRecent('docs')] });
    const recent = await recentList();

    await user.type(screen.getByRole('searchbox', { name: t('workspace.recent.search') }), 'docs');
    expect(within(recent).getAllByRole('listitem')).toHaveLength(1);

    await user.type(screen.getByRole('searchbox'), '-nope');
    expect(screen.getByText(t('workspace.recent.noMatch', { search: 'docs-nope' }))).toBeVisible();
    expect(screen.queryByText(t('workspace.recent.emptyTitle'))).toBeNull();
  });
});

describe('opening a folder from the welcome screen', () => {
  it('opens the dialog from the button, with the shortcut written beside it — S-186', async () => {
    const user = userEvent.setup();
    mount();

    expect(screen.getByText('Ctrl+O')).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('workspace.welcome.openFolder') }));

    expect(await screen.findByRole('dialog', { name: t('workspace.dialog.title') })).toBeVisible();
  });

  it('opens the dialog from the keyboard, with Ctrl+O — S-186', async () => {
    const user = userEvent.setup();
    mount();

    await user.keyboard('{Control>}o{/Control}');

    expect(await screen.findByRole('dialog', { name: t('workspace.dialog.title') })).toBeVisible();
  });

  it('closes the dialog on Esc, opening nothing, and gives the focus back', async () => {
    const user = userEvent.setup();
    const { onOpen } = mount();
    const button = screen.getByRole('button', { name: t('workspace.welcome.openFolder') });

    await user.click(button);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(button).toHaveFocus();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the dialog already inside a root, and opens what it chose', async () => {
    const user = userEvent.setup();
    const { onOpen } = mount();

    await user.click(
      await screen.findByRole('button', {
        name: t('workspace.roots.browse', { label: 'Projects' }),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Projects' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    await within(dialog).findByRole('option', { name: 'app' });

    await user.click(within(dialog).getByRole('button', { name: t('workspace.dialog.open') }));

    expect(onOpen).toHaveBeenCalledWith(projects.path);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

describe('the welcome screen, for everybody', () => {
  it('has no accessibility violation — S-85', async () => {
    const { container } = mount();
    await recentList();
    await screen.findByRole('list', { name: t('workspace.roots.title') });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('speaks the visitor’s language', async () => {
    mount(everything, 'pt-BR');

    expect(
      await screen.findByRole('button', {
        name: translator('pt-BR')('workspace.welcome.openFolder'),
      }),
    ).toBeVisible();
  });
});
