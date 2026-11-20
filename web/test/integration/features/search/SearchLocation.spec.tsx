import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { workbenchLocation } from '@/app/workbench-location';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { wsClient } from '@/shared/api/ws';
import { mountApp } from '../../../support/app';
import { fakeWatches } from '../../../support/explorer';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import { translator } from '../../../support/render';
import { fakeSearchApi } from '../../../support/search-api';
import { draftOnScreen, tabNamed, typeIn } from '../../../support/workbench';
import { aTab, aTabServer, fakeWorkspaceApi, projects } from '../../../support/workspace-api';

const t = translator('en');
const APP = `${projects.path}/app`;

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

beforeEach(() => {
  installFakeWebSocket();
  useAuthStore.setState({ status: 'unknown', session: null });
  vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  fakeSearchApi({ text: () => [{ type: 'end', truncated: null, skipped: 0 }] });
  fakeWatches();
});

afterEach(() => {
  wsClient.close();
  vi.restoreAllMocks();
});

function searchButton(): HTMLElement {
  return within(screen.getByRole('toolbar', { name: t('workbench.activityBar.label') })).getByRole(
    'button',
    { name: t('workbench.search.label') },
  );
}

describe('the Search view, in the address — plan 11, B-15, S-120', () => {
  it('opens with the query and the toggles a link names', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      recent: [],
      resolve: (path) => ({ path, root: projects }),
      ...aTabServer([aTab(APP)]).routes,
    });
    const user = userEvent.setup();
    mountApp(
      workbenchLocation({
        folder: APP,
        q: 'TODO',
        isRegex: true,
        caseSensitive: true,
        wholeWord: true,
        include: '*.ts',
        exclude: '*.spec.ts',
        useIgnoreFiles: false,
        onlyOpenEditors: true,
      }),
    );
    await draftOnScreen();

    await user.click(searchButton());

    expect(await screen.findByRole('searchbox', { name: t('search.view.queryLabel') })).toHaveValue(
      'TODO',
    );
    expect(screen.getByRole('button', { name: t('search.view.flagIsRegex') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: t('search.view.flagCaseSensitive') }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: t('search.view.flagWholeWord') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('textbox', { name: t('search.view.includeLabel') })).toHaveValue(
      '*.ts',
    );
    expect(screen.getByRole('textbox', { name: t('search.view.excludeLabel') })).toHaveValue(
      '*.spec.ts',
    );
    expect(
      screen.getByRole('button', { name: t('search.view.flagUseIgnoreFiles') }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: t('search.view.flagOnlyOpenEditors') }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('writes what is typed and toggled to the address, a field at its own default left out', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      recent: [],
      resolve: (path) => ({ path, root: projects }),
      ...aTabServer([aTab(APP)]).routes,
    });
    const user = userEvent.setup();
    const mounted = mountApp(workbenchLocation({ folder: APP }));
    await draftOnScreen();

    await user.click(searchButton());
    const query = await screen.findByRole('searchbox', { name: t('search.view.queryLabel') });
    await typeIn(user, query, 'TODO');

    expect(query).toHaveValue('TODO');

    await waitFor(() => {
      expect(mounted.search()).toMatchObject({ folder: APP, q: 'TODO' });
    });
    expect(mounted.search()).not.toHaveProperty('isRegex');
    expect(mounted.search()).not.toHaveProperty('useIgnoreFiles');

    await user.click(screen.getByRole('button', { name: t('search.view.flagIsRegex') }));
    await waitFor(() => {
      expect(mounted.search()).toMatchObject({ folder: APP, q: 'TODO', isRegex: true });
    });
  });

  it('keeps the search of the tab it belongs to — another tab never sees it (S-121)', async () => {
    const OTHER = `${projects.path}/other`;
    fakeWorkspaceApi({
      roots: [projects],
      recent: [],
      resolve: (path) => ({ path, root: projects }),
      ...aTabServer([aTab(APP), aTab(OTHER)]).routes,
    });
    const user = userEvent.setup();
    const mounted = mountApp(workbenchLocation({ folder: APP, q: 'TODO' }));
    await draftOnScreen();

    await user.click(await tabNamed('other'));

    await waitFor(() => {
      expect(mounted.search()).toMatchObject({ folder: OTHER });
    });
    expect(mounted.search()).not.toHaveProperty('q');
  });
});
