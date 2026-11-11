import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewRuleFolderStep } from '@/features/permission/components/NewRuleFolderStep';
import { render, translator } from '../../../support/render';
import { aListing, fakeWorkspaceApi, projects } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('step 4 of the rule-authoring wizard, where it reaches — plan 15, B-27', () => {
  it('offers everywhere or one project, with neither picked yet', () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderStep scope={null} folder={null} onChange={() => {}} />);

    const group = screen.getByRole('radiogroup', { name: t('rules.wizard.folderStepLabel') });
    expect(within(group).getByRole('radio', { name: t('rules.scope.always') })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(group).getByRole('radio', { name: t('rules.scope.project') })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.queryByText(t('rules.wizard.folderAlwaysBody'))).toBeNull();
    expect(screen.queryByText(t('rules.wizard.folderProjectBody'))).toBeNull();
  });

  it('never offers a text field for the folder — only the seletor (S-187)', () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderStep scope="project" folder={null} onChange={() => {}} />);

    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('picking "every project" clears any folder and explains the reach', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NewRuleFolderStep scope="project" folder={projects.path} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: t('rules.scope.always') }));

    expect(onChange).toHaveBeenCalledWith({ scope: 'always', folder: null });
  });

  it('picking "one project" asks for just the scope — the folder comes later, from the seletor', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NewRuleFolderStep scope={null} folder={null} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: t('rules.scope.project') }));

    expect(onChange).toHaveBeenCalledWith({ scope: 'project' });
  });

  it('explains "one project" reaches its subfolders (D-10), never the folder above it', () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderStep scope="project" folder={null} onChange={() => {}} />);

    expect(screen.getByText(t('rules.wizard.folderProjectBody'))).toBeVisible();
  });

  it('explains "every project" reaches any folder, in any session', () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderStep scope="always" folder={null} onChange={() => {}} />);

    expect(screen.getByText(t('rules.wizard.folderAlwaysBody'))).toBeVisible();
    expect(screen.queryByText(t('rules.wizard.folderProjectBody'))).toBeNull();
  });

  it('shows a Choose button with no folder chosen yet, under "one project"', () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderStep scope="project" folder={null} onChange={() => {}} />);

    expect(
      screen.getByRole('button', { name: t('rules.wizard.folderChoose') }),
    ).toBeInTheDocument();
  });

  it('shows the folder already chosen, and a Change button instead of Choose', () => {
    fakeWorkspaceApi({ roots: [projects] });
    render(<NewRuleFolderStep scope="project" folder={projects.path} onChange={() => {}} />);

    expect(
      screen.getByRole('button', { name: t('rules.wizard.folderChangeChoice') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('rules.wizard.folderChoose') })).toBeNull();
    expect(screen.getByText(projects.path)).toBeVisible();
  });

  it('opens the seletor, walks into a folder, and chooses it — closing the dialog and reporting the path', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
    });
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NewRuleFolderStep scope="project" folder={null} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: t('rules.wizard.folderChoose') }));
    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await user.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await user.click(within(dialog).getByRole('button', { name: t('rules.wizard.folderChoose') }));

    expect(onChange).toHaveBeenCalledWith({ folder: projects.path });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancels the seletor without reporting any folder', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NewRuleFolderStep scope="project" folder={null} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: t('rules.wizard.folderChoose') }));
    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await user.click(within(dialog).getByRole('button', { name: t('rules.wizard.folderCancel') }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
