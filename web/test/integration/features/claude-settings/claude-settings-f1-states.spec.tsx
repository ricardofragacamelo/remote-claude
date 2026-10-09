import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../support/app';
import { translator } from '../../../support/render';
import {
  ACCOUNT,
  backendAnswers,
  DEFAULTS,
  INSTALLATION,
  NONE,
} from '../../../support/claude-settings';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};
const unavailable = () =>
  Promise.reject(new AppError('CLAUDE_UNAVAILABLE', 'session.error.claudeUnavailable', 't1'));

describe('Claude settings — what each section does when things are not well (plan 13, F1)', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the account again past the minute it is kept, and tries again after a failure — S-26', async () => {
    const user = userEvent.setup();
    let fails = true;
    const get = backendAnswers({
      '/claude/account': () => (fails ? unavailable() : Promise.resolve(ACCOUNT)),
    });
    mountApp('/claude-settings?section=account');

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    fails = false;
    await user.click(retry);
    expect(await screen.findByText('person@example.com')).toBeVisible();

    await user.click(screen.getByRole('button', { name: t('claudeSettings.account.refresh') }));
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/claude/account?refresh=true');
    });
  });

  it('says what is missing from the installation, and where the configuration comes from — S-27, S-28', async () => {
    backendAnswers({
      '/claude/installation': () =>
        Promise.resolve({
          ...INSTALLATION,
          agentSdk: { version: null, reason: 'unreadable' },
          pathCli: { version: null, reason: 'notInstalled', differs: false },
          configDir: { path: '/srv/claude', fromEnvironment: true },
          login: 'loginRequired',
          lastModelCheck: {
            result: 'failed',
            model: null,
            latencyMs: 40,
            costUsd: null,
            reason: 'error_during_execution',
            at: '2026-10-09T12:00:00Z',
          },
        }),
    });
    mountApp('/claude-settings?section=installation');

    expect(await screen.findByText(t('claudeSettings.installation.notInstalled'))).toBeVisible();
    expect(screen.getByText(t('claudeSettings.installation.unreadable'))).toBeVisible();
    expect(
      screen.getByText(t('claudeSettings.installation.configDirFromEnvironment')),
    ).toBeVisible();
    expect(screen.getByText(t('claudeSettings.installation.loginRequired'))).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      t('claudeSettings.installation.checkFailed'),
    );
  });

  it('says a test that could not run, and tries the installation again — S-31, S-54', async () => {
    const user = userEvent.setup();
    let fails = true;
    backendAnswers({
      '/claude/installation': () => (fails ? unavailable() : Promise.resolve(INSTALLATION)),
    });
    vi.spyOn(api, 'post').mockImplementation(unavailable);
    mountApp('/claude-settings?section=installation');

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    fails = false;
    await user.click(retry);
    await screen.findByText(t('claudeSettings.installation.pathCliDiffers'));

    await user.click(screen.getByRole('button', { name: t('claudeSettings.installation.check') }));
    expect(await screen.findByText(t('session.error.claudeUnavailable'))).toBeVisible();
  });

  it('saves and clears the override of a folder, and leaves it through the picker — S-38', async () => {
    const user = userEvent.setup();
    let stored: unknown = null;
    backendAnswers({
      '/claude/defaults': () =>
        Promise.resolve({
          ...DEFAULTS,
          folder:
            stored === null ? null : { folder: '/srv/app', values: { ...NONE, thinking: 'off' } },
        }),
      '/workspaces/recent': () =>
        Promise.resolve({
          folders: [
            {
              path: '/srv/old',
              rootLabel: 'srv',
              lastOpenedAt: '2026-10-01T00:00:00Z',
              pinned: false,
              available: true,
            },
          ],
        }),
    });
    const put = vi.spyOn(api, 'put').mockImplementation(() => {
      stored = { thinking: 'off' };
      return Promise.resolve({
        ...DEFAULTS,
        folder: { folder: '/srv/app', values: { ...NONE, thinking: 'off' } },
      });
    });
    const remove = vi.spyOn(api, 'delete').mockImplementation(() => {
      stored = null;
      return Promise.resolve(undefined);
    });
    const app = mountApp('/claude-settings?section=models&folder=%2Fsrv%2Fapp');

    const form = await screen.findByRole('form', {
      name: t('claudeSettings.models.forFolder', { folder: '/srv/app' }),
    });
    await user.selectOptions(
      within(form).getByLabelText(t('claudeSettings.models.thinking')),
      'off',
    );
    await user.click(within(form).getByRole('button', { name: t('claudeSettings.models.save') }));
    expect(put).toHaveBeenCalledWith('/claude/defaults/folder', {
      folder: '/srv/app',
      ...NONE,
      thinking: 'off',
    });

    const again = await screen.findByRole('form', {
      name: t('claudeSettings.models.forFolder', { folder: '/srv/app' }),
    });
    await user.click(
      await within(again).findByRole('button', { name: t('claudeSettings.models.clearFolder') }),
    );
    expect(remove).toHaveBeenCalledWith('/claude/defaults/folder?folder=%2Fsrv%2Fapp');

    const picker = screen.getByLabelText(t('claudeSettings.folder.label'));
    await within(picker).findByRole('option', { name: '/srv/old' });
    await user.selectOptions(picker, '');
    await waitFor(() => {
      expect(app.search()).toEqual({ section: 'models' });
    });
  });

  it('refuses an effort the new model does not take, with why, until it changes — S-60', async () => {
    const user = userEvent.setup();
    backendAnswers();
    mountApp('/claude-settings?section=models');

    const form = await screen.findByRole('form', { name: t('claudeSettings.models.forUser') });
    const model = within(form).getByLabelText(t('claudeSettings.models.model'));
    await user.selectOptions(model, 'sonnet');
    await user.selectOptions(
      within(form).getByLabelText(t('claudeSettings.models.effort')),
      'high',
    );
    await user.selectOptions(model, 'haiku');

    expect(within(form).getByRole('alert')).toHaveTextContent(
      t('claudeSettings.models.effortRefused'),
    );
    expect(
      within(form).getByRole('button', { name: t('claudeSettings.models.save') }),
    ).toBeDisabled();

    await user.selectOptions(model, 'sonnet');
    expect(within(form).queryByRole('alert')).toBeNull();
    await user.selectOptions(model, '');
    expect(model).toHaveValue('');
  });

  it('tries the defaults again after they could not be read', async () => {
    const user = userEvent.setup();
    let fails = true;
    backendAnswers({
      '/claude/defaults': () => (fails ? unavailable() : Promise.resolve(DEFAULTS)),
    });
    mountApp('/claude-settings?section=models');

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    fails = false;
    await user.click(retry);

    expect(
      await screen.findByRole('form', { name: t('claudeSettings.models.forUser') }),
    ).toBeVisible();
  });
});
