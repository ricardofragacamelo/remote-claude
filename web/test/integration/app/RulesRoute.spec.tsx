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

/** `/rules`, reached by its link alone — which is what giving it a route is for. */
function mountRules() {
  return mountApp('/rules');
}

describe('the rules route', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits rather than deciding, while the sign-in is still unknown', async () => {
    vi.spyOn(authService, 'renewSession').mockImplementation(() => new Promise(() => undefined));

    mountRules();

    expect(await screen.findByLabelText(t('auth.callback.pending'))).toBeInTheDocument();
  });

  it('asks an anonymous visitor to sign in, and never lists anything first', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new Error('no cookie'));
    const get = vi.spyOn(api, 'get');

    mountRules();

    expect(await screen.findByText(t('auth.signIn.title'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('lists the rules of the signed-in visitor, from the link alone', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    mountRules();

    expect(await screen.findByText(t('rules.list.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('rules.screen.title') })).toBeInTheDocument();
  });

  it('leads back to the workbench, from the navigation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });
    const user = userEvent.setup();
    const mounted = mountRules();

    await user.click(await screen.findByRole('link', { name: t('navigation.entry.workbench') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/');
    });
  });

  it('lives in its own screen of the frame, its place lit, with its help — S-137', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    mountRules();

    expect(
      await screen.findByRole('heading', { level: 1, name: t('rules.screen.title') }),
    ).toBeVisible();
    expect(screen.getByText(t('rules.screen.purpose'))).toBeVisible();
    expect(screen.getByRole('link', { name: t('navigation.entry.rules') })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: t('help.panel.open') })).toBeVisible();
  });

  it('opens one rule by its link, active, with the way to revoke it — S-137', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({
      id: 'rule_1',
      scope: 'always',
      toolName: 'Write',
      pattern: 'Write(/workspace/summary.md)',
      decision: 'allow',
      projectPath: null,
      grantedBy: 'auth|42',
      grantedAt: '2026-09-20T10:00:00.000Z',
      expiresAt: '2026-12-19T10:00:00.000Z',
      status: 'active',
      revokedAt: null,
    });

    mountApp('/rules/rule_1');

    expect(await screen.findByRole('button', { name: t('rules.action.revoke') })).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: t('rules.detail.screenTitle') }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: t('navigation.entry.rules') })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });
    const { container } = mountRules();
    await screen.findByText(t('rules.list.emptyTitle'));

    expect(await axe(container)).toHaveNoViolations();
  });
});
