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
  backendAnswers,
  DEFAULTS,
  ENGINES,
  installationOnly,
  NONE,
  OUTPUT_STYLE,
} from '../../../support/claude-settings';
import { anEngineDto, anEngineList, CAPABILITIES } from '../../../support/engines';
import { translator } from '../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

describe("models and defaults, the core's own section — plan 13, F1; plan 28, B-36, B-38", () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves the user default, and refuses an effort the model does not take before sending — S-37, S-60', async () => {
    const user = userEvent.setup();
    backendAnswers(ENGINES);
    const putting = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ ...DEFAULTS, user: { ...NONE, model: 'haiku' } });
    mountApp('/settings/agents/claude?section=models');

    const form = await screen.findByRole('form', { name: t('agentSettings.models.forUser') });
    await user.selectOptions(within(form).getByLabelText(t('agentSettings.models.model')), 'haiku');

    const effort = await within(form).findByLabelText(t('agentSettings.models.effort'));
    expect(
      within(effort).getByRole('option', { name: t('agentSettings.models.effortHigh') }),
    ).toBeDisabled();

    await user.click(within(form).getByRole('button', { name: t('agentSettings.models.save') }));
    expect(putting).toHaveBeenCalledWith('/engines/claude/defaults', { ...NONE, model: 'haiku' });
  });

  it('offers the modes and the levels the engine announces, in its order — plan 28, S-81, S-83', async () => {
    backendAnswers({
      '/engines': () =>
        Promise.resolve(
          anEngineList({
            engines: [
              anEngineDto({
                capabilities: {
                  ...CAPABILITIES,
                  permissionModes: ['readOnly', 'ask'],
                  effortLevels: ['high', 'turbo'],
                },
              }),
            ],
          }),
        ),
    });
    mountApp('/settings/agents/claude?section=models');

    const form = await screen.findByRole('form', { name: t('agentSettings.models.forUser') });
    const effort = await within(form).findByLabelText(t('agentSettings.models.effort'));
    const mode = within(form).getByLabelText(t('agentSettings.models.permissionMode'));

    expect(
      within(mode)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      t('agentSettings.models.installationDefault'),
      t('agentSettings.models.modeReadOnly'),
      t('agentSettings.models.modeAsk'),
    ]);
    // A level this build has no name for is shown as the engine names it.
    expect(
      within(effort)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      t('agentSettings.models.installationDefault'),
      t('agentSettings.models.effortHigh'),
      'turbo',
    ]);
  });

  it('has no field of effort for an engine that announces no level — plan 28, S-83', async () => {
    backendAnswers({
      '/engines': () =>
        Promise.resolve(
          anEngineList({
            engines: [anEngineDto({ capabilities: { ...CAPABILITIES, effortLevels: [] } })],
          }),
        ),
      '/engines/claude/defaults': () =>
        Promise.resolve({ ...DEFAULTS, user: { ...NONE, effort: 'high' } }),
    });
    mountApp('/settings/agents/claude?section=models');

    const form = await screen.findByRole('form', { name: t('agentSettings.models.forUser') });
    await within(form).findByRole('option', { name: t('agentSettings.models.modeAllowAll') });

    expect(within(form).queryByLabelText(t('agentSettings.models.effort'))).toBeNull();
    // An effort kept before refuses nothing it cannot show.
    expect(
      within(form).getByRole('button', { name: t('agentSettings.models.save') }),
    ).toBeEnabled();
  });

  it('brings a refusal of the server back translated, saying what to do — S-61', async () => {
    const user = userEvent.setup();
    backendAnswers();
    // The extra field's own save answers fine: only the core's defaults are refused here.
    vi.spyOn(api, 'put').mockImplementation((route: string) =>
      route === '/engines/claude/defaults'
        ? Promise.reject(
            new AppError('MODEL_NOT_AVAILABLE', 'agentSettings.error.modelNotAvailable', 't2', {
              model: 'sonnet',
            }),
          )
        : Promise.resolve(OUTPUT_STYLE),
    );
    mountApp('/settings/agents/claude?section=models');

    const form = await screen.findByRole('form', { name: t('agentSettings.models.forUser') });
    await user.selectOptions(
      within(form).getByLabelText(t('agentSettings.models.model')),
      'sonnet',
    );
    await user.click(within(form).getByRole('button', { name: t('agentSettings.models.save') }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      t('agentSettings.error.modelNotAvailable', { model: 'sonnet' }),
    );
  });

  it('shows the override of the folder of the address, and where each value comes from — S-38', async () => {
    backendAnswers({
      '/engines/claude/defaults': () =>
        Promise.resolve({
          ...DEFAULTS,
          effective: {
            ...installationOnly,
            model: { value: 'haiku', from: 'folder', folder: '/srv/app' },
          },
          folder: { folder: '/srv/app', values: { ...NONE, model: 'haiku' } },
        }),
    });
    mountApp('/settings/agents/claude?section=models&folder=%2Fsrv%2Fapp');

    expect(
      await screen.findByRole('form', {
        name: t('agentSettings.models.forFolder', { folder: '/srv/app' }),
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        t('agentSettings.models.fromFolder', { value: 'haiku', folder: '/srv/app' }),
      ),
    ).toBeVisible();
  });

  it('changes the folder through the picker, keeping it in the address', async () => {
    const user = userEvent.setup();
    backendAnswers();
    const app = mountApp('/settings/agents/claude?section=models');

    const picker = await screen.findByLabelText(t('agentSettings.folder.label'));
    await within(picker).findByRole('option', { name: '/srv/app' });
    await user.selectOptions(picker, '/srv/app');

    await waitFor(() => {
      expect(app.search()).toEqual({ section: 'models', folder: '/srv/app' });
    });
  });

  it('explains an installation that lists no model, and offers only its default — S-36', async () => {
    backendAnswers({
      '/engines/claude/models': () => Promise.resolve({ models: [] }),
    });
    mountApp('/settings/agents/claude?section=models');

    expect(await screen.findByText(t('agentSettings.models.noModelsTitle'))).toBeVisible();
    const form = await screen.findByRole('form', { name: t('agentSettings.models.forUser') });
    expect(
      within(within(form).getByLabelText(t('agentSettings.models.model'))).getAllByRole('option'),
    ).toHaveLength(1);
  });

  it('saves and clears the override of a folder, and leaves it through the picker — S-38', async () => {
    const user = userEvent.setup();
    let stored: unknown = null;
    backendAnswers({
      '/engines/claude/defaults': () =>
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
    const app = mountApp('/settings/agents/claude?section=models&folder=%2Fsrv%2Fapp');

    const form = await screen.findByRole('form', {
      name: t('agentSettings.models.forFolder', { folder: '/srv/app' }),
    });
    await user.selectOptions(
      within(form).getByLabelText(t('agentSettings.models.thinking')),
      'off',
    );
    await user.click(within(form).getByRole('button', { name: t('agentSettings.models.save') }));
    expect(put).toHaveBeenCalledWith('/engines/claude/defaults/folder', {
      folder: '/srv/app',
      ...NONE,
      thinking: 'off',
    });

    const again = await screen.findByRole('form', {
      name: t('agentSettings.models.forFolder', { folder: '/srv/app' }),
    });
    await user.click(
      await within(again).findByRole('button', { name: t('agentSettings.models.clearFolder') }),
    );
    expect(remove).toHaveBeenCalledWith('/engines/claude/defaults/folder?folder=%2Fsrv%2Fapp');

    const picker = screen.getByLabelText(t('agentSettings.folder.label'));
    await within(picker).findByRole('option', { name: '/srv/old' });
    await user.selectOptions(picker, '');
    await waitFor(() => {
      expect(app.search()).toEqual({ section: 'models' });
    });
  });

  it('refuses an effort the new model does not take, with why, until it changes — S-60', async () => {
    const user = userEvent.setup();
    backendAnswers(ENGINES);
    mountApp('/settings/agents/claude?section=models');

    const form = await screen.findByRole('form', { name: t('agentSettings.models.forUser') });
    const model = within(form).getByLabelText(t('agentSettings.models.model'));
    await user.selectOptions(model, 'sonnet');
    await user.selectOptions(
      await within(form).findByLabelText(t('agentSettings.models.effort')),
      'high',
    );
    await user.selectOptions(model, 'haiku');

    expect(within(form).getByRole('alert')).toHaveTextContent(
      t('agentSettings.models.effortRefused'),
    );
    expect(
      within(form).getByRole('button', { name: t('agentSettings.models.save') }),
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
      '/engines/claude/defaults': () =>
        fails
          ? Promise.reject(
              new AppError('AGENT_UNAVAILABLE', 'session.error.agentUnavailable', 't1'),
            )
          : Promise.resolve(DEFAULTS),
    });
    mountApp('/settings/agents/claude?section=models');

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    fails = false;
    await user.click(retry);

    expect(
      await screen.findByRole('form', { name: t('agentSettings.models.forUser') }),
    ).toBeVisible();
  });

  it('has no extra field for an engine whose extension registered none of its own', async () => {
    backendAnswers({
      '/engines': () =>
        Promise.resolve(
          anEngineList({
            engines: [anEngineDto({ id: 'other', displayName: 'Other Agent' })],
          }),
        ),
      '/engines/other/models': () => Promise.resolve({ models: [] }),
      '/engines/other/defaults': () => Promise.resolve(DEFAULTS),
    });
    mountApp('/settings/agents/other?section=models');

    const form = await screen.findByRole('form', { name: t('agentSettings.models.forUser') });

    expect(within(form).queryByLabelText(t('engines.claude.defaults.outputStyle'))).toBeNull();
  });

  it('has help for each field, translated, and no axe violation — S-57, S-62', async () => {
    backendAnswers();
    const { container } = mountApp('/settings/agents/claude?section=models', 'pt-BR');
    const pt = translator('pt-BR');

    await screen.findByRole('form', { name: pt('agentSettings.models.forUser') });
    expect(await axe(container)).toHaveNoViolations();
    expect(pt('agentSettings.help.modesBody')).not.toBe(t('agentSettings.help.modesBody'));
  });

  it("reads and saves the output style alongside the core's own fields — plan 28, D-06", async () => {
    const user = userEvent.setup();
    backendAnswers({
      '/engines/claude/output-style': () => Promise.resolve({ ...OUTPUT_STYLE, user: 'concise' }),
    });
    const put = vi
      .spyOn(api, 'put')
      .mockImplementation((route: string) =>
        route === '/engines/claude/output-style'
          ? Promise.resolve({ ...OUTPUT_STYLE, user: 'terse' })
          : Promise.resolve({ ...DEFAULTS }),
      );
    mountApp('/settings/agents/claude?section=models');

    const form = await screen.findByRole('form', { name: t('agentSettings.models.forUser') });
    const style = await within(form).findByLabelText(t('engines.claude.defaults.outputStyle'));
    expect(style).toHaveValue('concise');

    await user.clear(style);
    await user.type(style, 'terse');
    await user.click(within(form).getByRole('button', { name: t('agentSettings.models.save') }));

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/engines/claude/output-style', { outputStyle: 'terse' });
    });
  });
});
