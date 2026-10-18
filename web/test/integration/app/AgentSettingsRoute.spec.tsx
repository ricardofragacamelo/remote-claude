import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { mountApp } from '../../support/app';
import { translator } from '../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

describe("an engine's settings, a screen of its own — plan 13, B-09; plan 28, B-36, B-38", () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the section and the folder the link names, its place lit in the navigation — S-15', async () => {
    const app = mountApp('/settings/agents/claude?section=mcp&folder=%2Fsrv%2Fapp');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: t('agentSettings.screen.title', { engine: 'claude' }),
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: t('agentSettings.mcp.title') }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: t('agentSettings.mcp.title') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: t('engines.claude.navigation.entry') }),
    ).toHaveAttribute('aria-current', 'page');
    expect(app.search()).toEqual({ section: 'mcp', folder: '/srv/app' });
  });

  it('goes to another section keeping the folder in the address, so the link reproduces it', async () => {
    const user = userEvent.setup();
    const app = mountApp('/settings/agents/claude?section=account&folder=%2Fsrv%2Fapp');

    await user.click(await screen.findByRole('button', { name: t('engines.claude.skills.title') }));

    await waitFor(() => {
      expect(app.search()).toEqual({ section: 'skills', folder: '/srv/app' });
    });
    expect(
      screen.getByRole('heading', { level: 2, name: t('engines.claude.skills.title') }),
    ).toBeVisible();
  });

  it('lands a section nobody knows on the first one, without an error', async () => {
    const app = mountApp('/settings/agents/claude?section=nowhere');

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: t('engines.claude.account.title'),
      }),
    ).toBeVisible();
    expect(app.search()).toEqual({ section: 'account' });
  });

  it('lands the bare address on the first section too', async () => {
    const app = mountApp('/settings/agents/claude');

    await screen.findByRole('heading', { level: 2, name: t('engines.claude.account.title') });
    expect(app.search()).toEqual({ section: 'account' });
  });

  it('has its help, and no axe violation', async () => {
    const { container } = mountApp('/settings/agents/claude', 'pt-BR');
    const pt = translator('pt-BR');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: pt('agentSettings.screen.title', { engine: 'claude' }),
      }),
    ).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});
