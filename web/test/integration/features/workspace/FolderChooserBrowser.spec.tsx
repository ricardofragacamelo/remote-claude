import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  FolderChooserBrowser,
  type FolderChooserLabelKeys,
} from '@/features/workspace/components/FolderChooserBrowser';
import { render, translator } from '../../../support/render';
import { aListing, fakeWorkspaceApi, projects, scratch } from '../../../support/workspace-api';
import type { WorkspaceRoutes } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

const disk: WorkspaceRoutes = {
  roots: [scratch, projects],
  directories: (asked) =>
    aListing(projects, asked.get('path') ?? '', asked.get('path') === projects.path ? ['app'] : []),
};

const RULE_WIZARD_KEYS: FolderChooserLabelKeys = {
  cancel: 'rules.wizard.folderCancel',
  confirm: 'rules.wizard.folderChoose',
};

const PLUGIN_KEYS: FolderChooserLabelKeys = {
  cancel: 'engines.claude.plugins.browseCancel',
  confirm: 'engines.claude.plugins.browseChoose',
};

/** A caller owning the ref the browser takes focus into on open, as every real caller does. */
function Host({
  labelKeys,
  onChoose = () => {},
  onCancel = () => {},
}: {
  readonly labelKeys: FolderChooserLabelKeys;
  onChoose?(path: string): void;
  onCancel?(): void;
}): React.JSX.Element {
  const list = useRef<HTMLDivElement>(null);

  return (
    <FolderChooserBrowser
      listRef={list}
      labelKeys={labelKeys}
      onChoose={onChoose}
      onCancel={onCancel}
    />
  );
}

describe('the shared folder-chooser body — plan 06/13/15', () => {
  it('lists the roots, with nothing yet to choose', async () => {
    fakeWorkspaceApi(disk);
    render(<Host labelKeys={RULE_WIZARD_KEYS} />);

    expect(await screen.findByRole('option', { name: 'Projects' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Scratch' })).toBeVisible();
    expect(screen.getByRole('button', { name: t('rules.wizard.folderChoose') })).toBeDisabled();
  });

  it('enables choosing once a folder is on screen, and calls back with it', async () => {
    const user = userEvent.setup();
    fakeWorkspaceApi(disk);
    const onChoose = vi.fn();
    render(<Host labelKeys={RULE_WIZARD_KEYS} onChoose={onChoose} />);

    await user.click(await screen.findByRole('option', { name: 'Projects' }));
    await user.click(screen.getByRole('button', { name: t('rules.wizard.folderChoose') }));

    expect(onChoose).toHaveBeenCalledWith(projects.path);
  });

  it('calls back on cancel', async () => {
    const user = userEvent.setup();
    fakeWorkspaceApi(disk);
    const onCancel = vi.fn();
    render(<Host labelKeys={RULE_WIZARD_KEYS} onCancel={onCancel} />);

    await user.click(await screen.findByRole('button', { name: t('rules.wizard.folderCancel') }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("wears whichever caller's own labels it is given — the object-prop two callers share", async () => {
    fakeWorkspaceApi(disk);
    const { unmount } = render(<Host labelKeys={RULE_WIZARD_KEYS} />);
    expect(
      screen.getByRole('button', { name: t('rules.wizard.folderChoose') }),
    ).toBeInTheDocument();
    unmount();

    render(<Host labelKeys={PLUGIN_KEYS} />);
    expect(
      screen.getByRole('button', { name: t('engines.claude.plugins.browseChoose') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('rules.wizard.folderChoose') })).toBeNull();
  });

  it('walks into a folder and shows what is inside it', async () => {
    const user = userEvent.setup();
    fakeWorkspaceApi(disk);
    render(<Host labelKeys={RULE_WIZARD_KEYS} />);

    await user.click(await screen.findByRole('option', { name: 'Projects' }));
    await user.click(await screen.findByRole('option', { name: 'app' }));

    expect(
      within(screen.getByRole('navigation', { name: t('workspace.dialog.breadcrumb') }))
        .getAllByRole('button')
        .map((crumb) => crumb.textContent),
    ).toEqual([t('workspace.dialog.roots'), 'Projects', 'app']);
  });
});
