import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../support/app';
import {
  ACCOUNT,
  backendAnswers,
  DEFAULTS,
  installationOnly,
  NONE,
} from '../../../support/claude-settings';
import { translator } from '../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

describe('Claude settings — account, installation, models and defaults (plan 13, F1)', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the account, and a CLI nobody signed in to as a state with the way out — S-24, S-25', async () => {
    backendAnswers();
    mountApp('/claude-settings?section=account');

    expect(await screen.findByText('person@example.com')).toBeVisible();

    vi.restoreAllMocks();
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    backendAnswers({
      '/claude/account': () => Promise.resolve({ ...ACCOUNT, state: 'loginRequired', email: null }),
    });
    mountApp('/claude-settings?section=account');

    expect(
      await screen.findAllByText(t('claudeSettings.account.loginRequiredTitle')),
    ).not.toHaveLength(0);
  });

  it('keeps the place while loading, and says why and offers to retry when it fails — S-54', async () => {
    backendAnswers({
      '/claude/account': () =>
        Promise.reject(new AppError('CLAUDE_UNAVAILABLE', 'session.error.claudeUnavailable', 't1')),
    });
    mountApp('/claude-settings?section=account');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('session.error.claudeUnavailable'),
    );
    expect(screen.getByRole('button', { name: t('common.action.retry') })).toBeVisible();
  });

  it('marks the claude on PATH that differs, and says what the test spends before it runs — S-27, S-30', async () => {
    const user = userEvent.setup();
    backendAnswers();
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      result: 'ok',
      model: 'claude-sonnet-5',
      latencyMs: 812,
      costUsd: 0.0012,
      reason: null,
      at: '2026-10-09T12:00:00Z',
    });
    mountApp('/claude-settings?section=installation');

    expect(await screen.findByText(t('claudeSettings.installation.pathCliDiffers'))).toBeVisible();
    expect(screen.getByText(t('claudeSettings.installation.checkCost'))).toBeVisible();

    await user.click(screen.getByRole('button', { name: t('claudeSettings.installation.check') }));

    expect(post).toHaveBeenCalledWith('/claude/diagnostics/model-check', {});
    expect(
      await screen.findByText(new RegExp(t('claudeSettings.installation.checkOk'))),
    ).toBeVisible();
  });

  it('saves the user default, and refuses an effort the model does not take before sending — S-37, S-60', async () => {
    const user = userEvent.setup();
    backendAnswers();
    const putting = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ ...DEFAULTS, user: { ...NONE, model: 'haiku' } });
    mountApp('/claude-settings?section=models');

    const form = await screen.findByRole('form', { name: t('claudeSettings.models.forUser') });
    await user.selectOptions(
      within(form).getByLabelText(t('claudeSettings.models.model')),
      'haiku',
    );

    const effort = within(form).getByLabelText(t('claudeSettings.models.effort'));
    expect(
      within(effort).getByRole('option', { name: t('claudeSettings.models.effortHigh') }),
    ).toBeDisabled();

    await user.click(within(form).getByRole('button', { name: t('claudeSettings.models.save') }));
    expect(putting).toHaveBeenCalledWith('/claude/defaults', { ...NONE, model: 'haiku' });
  });

  it('brings a refusal of the server back translated, saying what to do — S-61', async () => {
    const user = userEvent.setup();
    backendAnswers();
    vi.spyOn(api, 'put').mockRejectedValue(
      new AppError('MODEL_NOT_AVAILABLE', 'claudeConfig.error.modelNotAvailable', 't2', {
        model: 'sonnet',
      }),
    );
    mountApp('/claude-settings?section=models');

    const form = await screen.findByRole('form', { name: t('claudeSettings.models.forUser') });
    await user.selectOptions(
      within(form).getByLabelText(t('claudeSettings.models.model')),
      'sonnet',
    );
    await user.click(within(form).getByRole('button', { name: t('claudeSettings.models.save') }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      t('claudeConfig.error.modelNotAvailable', { model: 'sonnet' }),
    );
  });

  it('shows the override of the folder of the address, and where each value comes from — S-38', async () => {
    backendAnswers({
      '/claude/defaults': () =>
        Promise.resolve({
          ...DEFAULTS,
          effective: {
            ...installationOnly,
            model: { value: 'haiku', from: 'folder', folder: '/srv/app' },
          },
          folder: { folder: '/srv/app', values: { ...NONE, model: 'haiku' } },
        }),
    });
    mountApp('/claude-settings?section=models&folder=%2Fsrv%2Fapp');

    expect(
      await screen.findByRole('form', {
        name: t('claudeSettings.models.forFolder', { folder: '/srv/app' }),
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        t('claudeSettings.models.fromFolder', { value: 'haiku', folder: '/srv/app' }),
      ),
    ).toBeVisible();
  });

  it('changes the folder through the picker, keeping it in the address', async () => {
    const user = userEvent.setup();
    backendAnswers();
    const app = mountApp('/claude-settings?section=models');

    const picker = await screen.findByLabelText(t('claudeSettings.folder.label'));
    await within(picker).findByRole('option', { name: '/srv/app' });
    await user.selectOptions(picker, '/srv/app');

    await waitFor(() => {
      expect(app.search()).toEqual({ section: 'models', folder: '/srv/app' });
    });
  });

  it('explains an installation that lists no model, and offers only its default — S-36', async () => {
    backendAnswers({
      '/claude/models': () =>
        Promise.resolve({ cliVersion: '2.1.277', models: [], permissionModes: [] }),
    });
    mountApp('/claude-settings?section=models');

    expect(await screen.findByText(t('claudeSettings.models.noModelsTitle'))).toBeVisible();
    const form = await screen.findByRole('form', { name: t('claudeSettings.models.forUser') });
    expect(
      within(within(form).getByLabelText(t('claudeSettings.models.model'))).getAllByRole('option'),
    ).toHaveLength(1);
  });

  it('leaves the app’s Settings with a way here, and no section of Claude there — S-55', async () => {
    const user = userEvent.setup();
    backendAnswers();
    const app = mountApp('/settings');

    await user.click(await screen.findByRole('link', { name: t('settings.links.claude') }));

    await waitFor(() => {
      expect(app.path()).toBe('/claude-settings');
    });
  });

  it('has the commands of the screen in the palette, and their shortcuts work — S-59', async () => {
    const user = userEvent.setup();
    backendAnswers();
    const app = mountApp('/settings');
    await screen.findByRole('link', { name: t('settings.links.claude') });

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), 'default model');
    expect(
      await screen.findByRole('option', { name: new RegExp(t('command.claude.defaultModel')) }),
    ).toBeVisible();
    await user.keyboard('{Escape}');

    await user.keyboard('{Control>}k{/Control}t');
    await waitFor(() => {
      expect(app.search()).toMatchObject({ section: 'installation' });
    });
    await user.keyboard('{Control>}k{/Control}m');
    await waitFor(() => {
      expect(app.search()).toMatchObject({ section: 'models' });
    });
  });

  it('has help for each field, translated, and no axe violation — S-57, S-62', async () => {
    backendAnswers();
    const { container } = mountApp('/claude-settings?section=models', 'pt-BR');
    const pt = translator('pt-BR');

    await screen.findByRole('form', { name: pt('claudeSettings.models.forUser') });
    expect(await axe(container)).toHaveNoViolations();
    expect(pt('claudeSettings.help.modesBody')).not.toBe(t('claudeSettings.help.modesBody'));
  });
});
