import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { WorkspaceSelector, useWorkspaceStore } from '@/features/workspace';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');

const projects = { path: '/srv/projects', label: 'Projects', lastUsedAt: null };
const other = {
  path: '/srv/other',
  label: 'Other',
  lastUsedAt: '2026-09-18T10:00:00.000Z',
};

/** A failure shaped the way `api.ts` hands one on. */
const forbidden = {
  code: 'FORBIDDEN',
  messageKey: 'common.error.forbidden',
  params: {},
  traceId: 'trace-1',
};

describe('the workspace selector', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().select(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A never-settling request, which is what the loading state actually looks like. */
  function pending(): void {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
  }

  function answers(...workspaces: readonly unknown[]): void {
    vi.spyOn(api, 'get').mockResolvedValue({ workspaces });
  }

  it('shows the loading state while the roots are on their way', () => {
    pending();
    render(<WorkspaceSelector />);

    expect(screen.getByLabelText(t('workspace.selector.loading'))).toBeInTheDocument();
  });

  it('shows the roots once they arrive', async () => {
    answers(projects, other);
    render(<WorkspaceSelector />);

    expect(await screen.findByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('shows the path, because two roots can share a label', async () => {
    answers(projects);
    render(<WorkspaceSelector />);

    expect(await screen.findByText('/srv/projects')).toBeInTheDocument();
  });

  it('says a root was never opened rather than leaving the line blank', async () => {
    answers(projects);
    render(<WorkspaceSelector />);

    expect(await screen.findByText(t('workspace.selector.neverUsed'))).toBeInTheDocument();
  });

  it('says when a root was last opened', async () => {
    answers(other);
    render(<WorkspaceSelector />);

    expect(
      await screen.findByText(t('workspace.selector.lastUsed', { at: other.lastUsedAt })),
    ).toBeInTheDocument();
  });

  it('shows the empty state, which explains rather than reporting nothing', async () => {
    // An installation whose allowlist does not mention this person is not a bug, and "no
    // workspaces" on its own reads as one.
    answers();
    render(<WorkspaceSelector />);

    expect(await screen.findByText(t('workspace.selector.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('workspace.selector.emptyDescription'))).toBeInTheDocument();
  });

  it('shows the error state with the trace, so the failure can be reported', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(forbidden);
    render(<WorkspaceSelector />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(t('common.error.traceLabel', { traceId: 'trace-1' })),
    ).toBeInTheDocument();
  });

  it('retries from the error state, and shows what the retry found', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(forbidden)
      .mockResolvedValueOnce({ workspaces: [projects] });

    render(<WorkspaceSelector />);
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText('Projects')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not keep a stale list next to an error', async () => {
    // Leaving the previous roots on screen says they are still there, and the next click would
    // act on a list that is no longer true.
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ workspaces: [projects] })
      .mockRejectedValueOnce(forbidden);

    render(<WorkspaceSelector />);
    await screen.findByText('Projects');

    // No retry button while the list is fine, so the second load is driven through the store.
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('records the choice, so the session screen can read it later', async () => {
    answers(projects, other);
    render(<WorkspaceSelector />);

    await userEvent.click(await screen.findByRole('button', { name: /Projects/ }));

    expect(useWorkspaceStore.getState().selected).toBe('/srv/projects');
  });

  it('marks the chosen root as pressed, and only that one', async () => {
    answers(projects, other);
    render(<WorkspaceSelector />);

    await userEvent.click(await screen.findByRole('button', { name: /Projects/ }));

    expect(screen.getByRole('button', { name: /Projects/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Other/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves the choice when another root is picked', async () => {
    answers(projects, other);
    render(<WorkspaceSelector />);

    await userEvent.click(await screen.findByRole('button', { name: /Projects/ }));
    await userEvent.click(screen.getByRole('button', { name: /Other/ }));

    expect(useWorkspaceStore.getState().selected).toBe('/srv/other');
  });

  it('never renders a word that did not come from the catalogue', async () => {
    answers(projects);
    const { container } = render(<WorkspaceSelector />, 'pt-BR');

    await screen.findByText('Projects');

    expect(container.textContent).toContain(translator('pt-BR')('workspace.selector.description'));
  });

  it('has no accessibility violation in any of its states', async () => {
    answers(projects);
    const { container } = render(<WorkspaceSelector />);
    await screen.findByText('Projects');

    expect(await axe(container)).toHaveNoViolations();
  });
});
