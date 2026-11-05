import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { commandRegistry } from '@/features/commands';
import { mountApp } from '../../../support/app';
import { backendAnswers, ENGINES } from '../../../support/claude-settings';
import { translator } from '../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

describe('Claude\'s shortcuts, beyond the generic "go to its settings" — plan 13, B-17, S-59, B-40, S-184; plan 28, B-38', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the commands of the screen in the palette, and their shortcuts work — S-59', async () => {
    const user = userEvent.setup();
    backendAnswers(ENGINES);
    const app = mountApp('/settings');
    // `t()` reads the engine's displayName through a directory that loads asynchronously (plan 28,
    // B-13) — computed once up front it can freeze on the id, before the name ever arrives, so this
    // re-evaluates it on every poll instead (S-26).
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: t('settings.links.agentSettings', { engine: 'claude' }) }),
      ).toBeInTheDocument();
    });

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), 'default model');
    expect(
      await screen.findByRole('option', {
        name: new RegExp(t('engines.claude.command.defaultModel')),
      }),
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

  it('has the Project shortcuts in the palette too, each landing on "Project" — B-40, S-184', async () => {
    const user = userEvent.setup();
    backendAnswers(ENGINES);
    const app = mountApp('/settings');
    await screen.findByRole('heading', { level: 1, name: t('settings.screen.title') });
    // `t()` reads the engine's displayName through a directory that loads asynchronously (plan 28,
    // B-13) — computed once up front it can freeze on the id, before the name ever arrives, so this
    // re-evaluates it on every poll instead (S-26).
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: t('settings.links.agentSettings', { engine: 'claude' }) }),
      ).toBeInTheDocument();
    });

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), 'CLAUDE.md');
    expect(
      await screen.findByRole('option', {
        name: new RegExp(t('engines.claude.command.openMemory')),
      }),
    ).toBeVisible();
    await user.keyboard('{Escape}');

    await user.keyboard('{Control>}k{/Control}c');
    await waitFor(() => {
      expect(app.search()).toMatchObject({ section: 'project' });
    });

    await user.keyboard('{Control>}k{/Control}n');
    await waitFor(() => {
      expect(app.search()).toMatchObject({ section: 'project' });
    });

    await user.keyboard('{Control>}k{/Control}g');
    await waitFor(() => {
      expect(app.search()).toMatchObject({ section: 'project' });
    });
  });

  it('still answers to the ids these two shortcuts had before plan 28 (B-39) renamed them', async () => {
    backendAnswers(ENGINES);
    mountApp('/settings');
    await screen.findByRole('heading', { level: 1, name: t('settings.screen.title') });
    // `t()` reads the engine's displayName through a directory that loads asynchronously (plan 28,
    // B-13) — computed once up front it can freeze on the id, before the name ever arrives, so this
    // re-evaluates it on every poll instead (S-26).
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: t('settings.links.agentSettings', { engine: 'claude' }) }),
      ).toBeInTheDocument();
    });

    expect(commandRegistry.currentId('claude.defaultModel')).toBe('agent.defaultModel');
    expect(commandRegistry.command('claude.defaultModel')?.id).toBe('agent.defaultModel');
    expect(commandRegistry.currentId('claude.testConnection')).toBe('agent.testConnection');
    expect(commandRegistry.command('claude.testConnection')?.id).toBe('agent.testConnection');
  });
});
