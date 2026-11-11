import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewRuleFolderDialog } from '@/features/permission/components/NewRuleFolderDialog';
import { render, translator } from '../../../support/render';
import { aListing, fakeWorkspaceApi, projects } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the rule-authoring wizard\'s own "choose a folder" dialog — plan 15, B-27, S-187', () => {
  it('renders nothing while closed', () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderDialog open={false} onOpenChange={() => {}} onChoose={() => {}} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("names its own title and description — never the plan 06 opener's own words", async () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderDialog open onOpenChange={() => {}} onChoose={() => {}} />);

    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    expect(within(dialog).getByText(t('rules.wizard.folderDialogDescription'))).toBeVisible();
  });

  it('starts with nothing to choose until a folder is on screen', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderDialog open onOpenChange={() => {}} onChoose={() => {}} />);

    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await within(dialog).findByRole('option', { name: 'Projects' });

    expect(
      within(dialog).getByRole('button', { name: t('rules.wizard.folderChoose') }),
    ).toBeDisabled();
  });

  it('reports the folder on screen when chosen, leaving `open` for the caller to decide', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
    });
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const onOpenChange = vi.fn();
    render(<NewRuleFolderDialog open onOpenChange={onOpenChange} onChoose={onChoose} />);

    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(within(dialog).getByRole('button', { name: t('rules.wizard.folderChoose') }));

    expect(onChoose).toHaveBeenCalledWith(projects.path);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('asks to close, without choosing anything, on Cancel', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const onOpenChange = vi.fn();
    render(<NewRuleFolderDialog open onOpenChange={onOpenChange} onChoose={onChoose} />);

    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await user.click(within(dialog).getByRole('button', { name: t('rules.wizard.folderCancel') }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('offers no root at all when the allowlist has none — nothing outside it is ever offered', async () => {
    fakeWorkspaceApi({ roots: [] });
    render(<NewRuleFolderDialog open onOpenChange={() => {}} onChoose={() => {}} />);

    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    expect(await within(dialog).findByText(t('workspace.dialog.noRootsTitle'))).toBeVisible();
  });
});
