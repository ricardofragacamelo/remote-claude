import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../support/app';
import { ACCOUNT, backendAnswers, INSTALLATION } from '../../../support/claude-settings';
import { translator } from '../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};
const unavailable = () =>
  Promise.reject(new AppError('AGENT_UNAVAILABLE', 'session.error.agentUnavailable', 't1'));

describe("Claude's own sections — the account and the installation (plan 13, F1; plan 28, B-38)", () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the account, and a CLI nobody signed in to as a state with the way out — S-24, S-25', async () => {
    backendAnswers();
    mountApp('/settings/agents/claude?section=account');

    expect(await screen.findByText('person@example.com')).toBeVisible();

    vi.restoreAllMocks();
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    backendAnswers({
      '/engines/claude/account': () =>
        Promise.resolve({ ...ACCOUNT, state: 'loginRequired', email: null }),
    });
    mountApp('/settings/agents/claude?section=account');

    expect(
      await screen.findAllByText(t('engines.claude.account.loginRequiredTitle')),
    ).not.toHaveLength(0);
  });

  it('keeps the place while loading, and says why and offers to retry when it fails — S-54', async () => {
    backendAnswers({ '/engines/claude/account': unavailable });
    mountApp('/settings/agents/claude?section=account');

    expect(await screen.findByRole('alert')).toHaveTextContent(t('session.error.agentUnavailable'));
    expect(screen.getByRole('button', { name: t('common.action.retry') })).toBeVisible();
  });

  it('reads the account again past the minute it is kept, and tries again after a failure — S-26', async () => {
    const user = userEvent.setup();
    let fails = true;
    const get = backendAnswers({
      '/engines/claude/account': () => (fails ? unavailable() : Promise.resolve(ACCOUNT)),
    });
    mountApp('/settings/agents/claude?section=account');

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    fails = false;
    await user.click(retry);
    expect(await screen.findByText('person@example.com')).toBeVisible();

    await user.click(screen.getByRole('button', { name: t('engines.claude.account.refresh') }));
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/engines/claude/account?refresh=true');
    });
  });

  it('marks the claude on PATH that differs, and says what the test spends before it runs — S-27, S-30', async () => {
    const user = userEvent.setup();
    backendAnswers();
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      result: 'ok',
      model: 'claude-sonnet-5',
      latencyMs: 812,
      costUsd: '0.0012',
      reason: null,
      at: '2026-10-09T12:00:00Z',
    });
    mountApp('/settings/agents/claude?section=installation');

    expect(await screen.findByText(t('engines.claude.installation.pathCliDiffers'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.installation.checkCost'))).toBeVisible();

    await user.click(screen.getByRole('button', { name: t('engines.claude.installation.check') }));

    expect(post).toHaveBeenCalledWith('/engines/claude/diagnostics/model-check', {});
    expect(
      await screen.findByText(new RegExp(t('engines.claude.installation.checkOk'))),
    ).toBeVisible();
  });

  it('says what is missing from the installation, and where the configuration comes from — S-27, S-28', async () => {
    backendAnswers({
      '/engines/claude/installation': () =>
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
    mountApp('/settings/agents/claude?section=installation');

    expect(await screen.findByText(t('engines.claude.installation.notInstalled'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.installation.unreadable'))).toBeVisible();
    expect(
      screen.getByText(t('engines.claude.installation.configDirFromEnvironment')),
    ).toBeVisible();
    expect(screen.getByText(t('engines.claude.installation.loginRequired'))).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      t('engines.claude.installation.checkFailed'),
    );
  });

  it('says a test that could not run, and tries the installation again — S-31, S-54', async () => {
    const user = userEvent.setup();
    let fails = true;
    backendAnswers({
      '/engines/claude/installation': () => (fails ? unavailable() : Promise.resolve(INSTALLATION)),
    });
    vi.spyOn(api, 'post').mockImplementation(unavailable);
    mountApp('/settings/agents/claude?section=installation');

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    fails = false;
    await user.click(retry);
    await screen.findByText(t('engines.claude.installation.pathCliDiffers'));

    await user.click(screen.getByRole('button', { name: t('engines.claude.installation.check') }));
    expect(await screen.findByText(t('session.error.agentUnavailable'))).toBeVisible();
  });
});
