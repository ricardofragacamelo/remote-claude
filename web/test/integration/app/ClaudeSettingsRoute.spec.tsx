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

describe('Claude settings, a screen of its own — plan 13, B-09', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the section and the folder the link names, its place lit in the navigation — S-15', async () => {
    const app = mountApp('/claude-settings?section=mcp&folder=%2Fsrv%2Fapp');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('claudeSettings.screen.title') }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: t('claudeSettings.mcp.title') }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: t('claudeSettings.mcp.title') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: t('navigation.entry.claude') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(app.search()).toEqual({ section: 'mcp', folder: '/srv/app' });
  });

  it('goes to another section keeping the folder in the address, so the link reproduces it', async () => {
    const user = userEvent.setup();
    const app = mountApp('/claude-settings?section=account&folder=%2Fsrv%2Fapp');

    await user.click(await screen.findByRole('button', { name: t('claudeSettings.skills.title') }));

    await waitFor(() => {
      expect(app.search()).toEqual({ section: 'skills', folder: '/srv/app' });
    });
    expect(
      screen.getByRole('heading', { level: 2, name: t('claudeSettings.skills.title') }),
    ).toBeVisible();
  });

  it('lands an unknown section on the first one, without an error', async () => {
    const app = mountApp('/claude-settings?section=nowhere');

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: t('claudeSettings.account.title'),
      }),
    ).toBeVisible();
    expect(app.search()).toEqual({ section: 'account' });
  });

  it('has its help, and no axe violation', async () => {
    const { container } = mountApp('/claude-settings', 'pt-BR');
    const pt = translator('pt-BR');

    expect(
      await screen.findByRole('heading', { level: 1, name: pt('claudeSettings.screen.title') }),
    ).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});
