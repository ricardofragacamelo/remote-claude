import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { OpenFolderDialog } from '@/features/workspace/components/OpenFolderDialog';
import { render, translator } from '../../../support/render';
import {
  aListing,
  fakeWorkspaceApi,
  projects,
  refusal,
  scratch,
} from '../../../support/workspace-api';
import type { WorkspaceRoutes } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

const DISK: Record<string, readonly string[]> = {
  [projects.path]: ['app', 'docs', 'linked'],
  [`${projects.path}/app`]: ['src'],
  [`${projects.path}/app/src`]: [],
  [`${projects.path}/docs`]: [],
};

const disk: WorkspaceRoutes = {
  roots: [scratch, projects],
  directories: (asked) => {
    const path = asked.get('path') ?? '';
    const hidden = asked.get('hidden') === 'true' ? ['.git'] : [];
    return aListing(projects, path, [...(DISK[path] ?? []), ...hidden], { symlinks: ['linked'] });
  },
};

/** The dialog behind a button, the way a screen opens it — so the focus has somewhere to go back. */
function Opener({ onOpen }: { onOpen(path: string): void }): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* eslint-disable-next-line react/jsx-no-literals -- a test harness, not a screen */}
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <OpenFolderDialog open={open} onOpenChange={setOpen} startAt={null} onOpen={onOpen} />
    </>
  );
}

async function opened(routes: WorkspaceRoutes = disk) {
  const user = userEvent.setup();
  const api = fakeWorkspaceApi(routes);
  const onOpen = vi.fn();
  const mounted = render(<Opener onOpen={onOpen} />);
  await user.click(screen.getByRole('button', { name: 'opener' }));
  const dialog = await screen.findByRole('dialog', { name: t('workspace.dialog.title') });
  return { ...mounted, user, api, onOpen, dialog };
}

function listbox(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByRole('listbox');
}

function crumbs(dialog: HTMLElement): string[] {
  return within(within(dialog).getByRole('navigation', { name: t('workspace.dialog.breadcrumb') }))
    .getAllByRole('button')
    .map((crumb) => crumb.textContent ?? '');
}

describe('walking the roots — S-72', () => {
  it('starts on the roots, with nothing to open until a folder is on screen', async () => {
    const { dialog } = await opened();

    expect(await within(dialog).findByRole('option', { name: 'Projects' })).toBeVisible();
    expect(within(dialog).getByRole('option', { name: 'Scratch' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: t('workspace.dialog.open') })).toBeDisabled();
    expect(crumbs(dialog)).toEqual([t('workspace.dialog.roots')]);
  });

  it('goes into a root and a subfolder by clicking, and the crumbs follow', async () => {
    const { user, dialog } = await opened();

    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(await within(dialog).findByRole('option', { name: 'app' }));

    expect(await within(dialog).findByRole('option', { name: 'src' })).toBeVisible();
    expect(crumbs(dialog)).toEqual([t('workspace.dialog.roots'), 'Projects', 'app']);
  });

  it('goes back by a crumb, and the first crumb above a root is the list of roots', async () => {
    const { user, dialog } = await opened();
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(await within(dialog).findByRole('option', { name: 'app' }));
    await within(dialog).findByRole('option', { name: 'src' });

    await user.click(within(dialog).getByRole('button', { name: 'Projects' }));
    expect(await within(dialog).findByRole('option', { name: 'docs' })).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: t('workspace.dialog.roots') }));
    expect(await within(dialog).findByRole('option', { name: 'Scratch' })).toBeVisible();
  });

  it('opens the folder on screen without going into a subfolder', async () => {
    const { user, dialog, onOpen } = await opened();
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await within(dialog).findByRole('option', { name: 'app' });

    await user.click(within(dialog).getByRole('button', { name: t('workspace.dialog.open') }));

    expect(onOpen).toHaveBeenCalledWith(projects.path);
  });

  it('marks a symbolic link with a label a screen reader says', async () => {
    const { user, dialog } = await opened();
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));

    expect(
      await within(dialog).findByRole('option', {
        name: t('workspace.dialog.symlinkOption', { name: 'linked' }),
      }),
    ).toBeVisible();
    expect(within(dialog).getByTitle(t('workspace.dialog.symlink'))).toBeInTheDocument();
  });
});

describe('the keyboard — S-73', () => {
  it('lands on the list, walks it, goes in with Enter and up with Backspace or Alt+↑', async () => {
    const { user, dialog } = await opened();
    await within(dialog).findByRole('option', { name: 'Projects' });
    expect(listbox(dialog)).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(within(dialog).getByRole('option', { name: 'Projects' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(listbox(dialog)).toHaveAttribute(
      'aria-activedescendant',
      within(dialog).getByRole('option', { name: 'Projects' }).id,
    );

    await user.keyboard('{Enter}');
    await within(dialog).findByRole('option', { name: 'app' });
    await user.keyboard('{Enter}');
    await within(dialog).findByRole('option', { name: 'src' });

    await user.keyboard('{Backspace}');
    await within(dialog).findByRole('option', { name: 'docs' });
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(await within(dialog).findByRole('option', { name: 'Scratch' })).toBeVisible();
  });

  it('narrows by what is typed, says so, and clears it', async () => {
    const { user, dialog } = await opened();
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await within(dialog).findByRole('option', { name: 'app' });

    await user.keyboard('d');

    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['docs']);
    expect(within(dialog).getByText(t('workspace.dialog.filter', { filter: 'd' }))).toBeVisible();

    await user.keyboard('z');
    expect(within(dialog).getByText(t('workspace.dialog.noMatch', { filter: 'dz' }))).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('workspace.dialog.clearFilter') }),
    );
    expect(within(dialog).getAllByRole('option')).toHaveLength(3);
    expect(listbox(dialog)).toHaveFocus();
  });

  it('closes on Esc and gives the focus back to what opened it', async () => {
    const { user } = await opened();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'opener' })).toHaveFocus();
  });

  it('closes on Cancel too, opening nothing', async () => {
    const { user, dialog, onOpen } = await opened();

    await user.click(within(dialog).getByRole('button', { name: t('workspace.dialog.cancel') }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('what a listing can say', () => {
  it('asks again with the hidden folders when they are to be shown — S-74', async () => {
    const { user, dialog, api } = await opened();
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await within(dialog).findByRole('option', { name: 'app' });

    await user.click(
      within(dialog).getByRole('checkbox', { name: t('workspace.dialog.showHidden') }),
    );

    expect(await within(dialog).findByRole('option', { name: '.git' })).toBeVisible();
    expect(api.get.mock.calls.some(([path]) => String(path).includes('hidden=true'))).toBe(true);
  });

  it('warns that a listing was cut, and sends the filter to the server — S-75', async () => {
    const { user, dialog, api } = await opened({
      roots: [projects],
      directories: (asked) =>
        asked.get('prefix') === null
          ? aListing(projects, projects.path, ['a1'], { truncated: true })
          : aListing(projects, projects.path, ['zulu']),
    });
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      t('workspace.dialog.truncated'),
    );
    await user.keyboard('z');

    expect(await within(dialog).findByRole('option', { name: 'zulu' })).toBeVisible();
    expect(api.get.mock.calls.some(([path]) => String(path).includes('prefix=z'))).toBe(true);
  });
});

describe('the four states of the list — S-76', () => {
  it('holds the shape of the list while it loads', async () => {
    const { dialog } = await opened({ roots: () => new Promise(() => undefined) });

    expect(within(dialog).getByLabelText(t('workspace.dialog.loading'))).toBeVisible();
    expect(listbox(dialog)).toHaveAttribute('aria-busy', 'true');
  });

  it('says a folder it may not read cannot be read — and stays open, with a way to try again', async () => {
    const unreadable = refusal(
      'WORKSPACE_DIRECTORY_UNREADABLE',
      'workspace.error.directoryUnreadable',
      {
        path: `${projects.path}/app`,
      },
    );
    let refuse = true;
    const { user, dialog, api } = await opened({
      roots: [projects],
      directories: (asked) =>
        asked.get('path') === `${projects.path}/app` && refuse
          ? unreadable
          : aListing(
              projects,
              asked.get('path') ?? '',
              asked.get('path') === projects.path ? ['app'] : [],
            ),
    });
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(await within(dialog).findByRole('option', { name: 'app' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      t('workspace.error.directoryUnreadable', { path: `${projects.path}/app` }),
    );
    expect(screen.getByRole('dialog')).toBeVisible();

    refuse = false;
    await user.click(within(dialog).getByRole('button', { name: t('common.action.retry') }));
    expect(await within(dialog).findByText(t('workspace.dialog.emptyTitle'))).toBeVisible();
    expect(
      api.get.mock.calls.filter(([path]) => String(path).includes('app')).length,
    ).toBeGreaterThan(1);
  });

  it('explains a folder with no subfolders, and still lets it be opened', async () => {
    const { user, dialog, onOpen } = await opened();
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(await within(dialog).findByRole('option', { name: 'docs' }));

    expect(await within(dialog).findByText(t('workspace.dialog.emptyTitle'))).toBeVisible();
    expect(within(dialog).getByText(t('workspace.dialog.emptyDescription'))).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t('workspace.dialog.open') }));

    expect(onOpen).toHaveBeenCalledWith(`${projects.path}/docs`);
  });

  it('explains a user with no root at all', async () => {
    const { dialog } = await opened({ roots: [] });

    expect(await within(dialog).findByText(t('workspace.dialog.noRootsTitle'))).toBeVisible();
  });
});

describe('the help of the dialog', () => {
  it('says why only these folders show, and how to add one', async () => {
    const { user, dialog } = await opened();
    const toggle = within(dialog).getByRole('button', { name: t('workspace.dialog.helpToggle') });

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByText(t('workspace.dialog.helpBody'))).toBeVisible();
    expect(within(dialog).getByText(t('workspace.allowlist.command'))).toBeVisible();
  });
});

describe('the dialog, for everybody — S-85', () => {
  it('has no accessibility violation, on the roots and inside a folder', async () => {
    const { user, dialog } = await opened();
    await within(dialog).findByRole('option', { name: 'Projects' });
    expect(await axe(document.body)).toHaveNoViolations();

    await user.click(within(dialog).getByRole('option', { name: 'Projects' }));
    await within(dialog).findByRole('option', { name: 'app' });
    await user.click(
      within(dialog).getByRole('button', { name: t('workspace.dialog.helpToggle') }),
    );
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
