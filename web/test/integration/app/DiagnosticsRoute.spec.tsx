import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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

describe('Logs and diagnostics, a screen of its own — plan 06, B-30', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => undefined));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('holds the connection and the round trip that left the home — S-139', async () => {
    mountApp('/diagnostics');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('diagnostics.screen.title') }),
    ).toBeVisible();
    expect(screen.getByText(t('diagnostics.connection.title'))).toBeVisible();
    expect(screen.getByRole('button', { name: t('diagnostics.ping.action') })).toBeVisible();
    expect(screen.getByRole('link', { name: t('navigation.entry.diagnostics') })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('has no accessibility violation', async () => {
    const { container } = mountApp('/diagnostics');
    await screen.findByRole('button', { name: t('diagnostics.ping.action') });

    expect(await axe(container)).toHaveNoViolations();
  });
});
