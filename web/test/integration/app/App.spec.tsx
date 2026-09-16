import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';

import { App } from '@/app/App';
import { Callback } from '@/app/Callback';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { AppError } from '@/shared/api/errors';
import { navigation } from '@/shared/lib/navigation';
import { render, translator } from '../../support/render';

const t = translator('en');

const session = { accessToken: 'a', userId: 'auth|42', expiresAt: Date.now() + 900_000 };

describe('the shell', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits rather than deciding, while the sign-in is still unknown', () => {
    vi.spyOn(authService, 'renewSession').mockImplementation(() => new Promise(() => undefined));

    render(<App />);

    expect(screen.getByLabelText(t('auth.callback.pending'))).toBeInTheDocument();
  });

  it('signs the visitor in from the refresh cookie when there is one', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('session.ping.action') })).toBeInTheDocument();
    });
  });

  it('asks the visitor to sign in when there is no session to resume', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(t('auth.signIn.title'))).toBeInTheDocument();
    });
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));
    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText(t('auth.signIn.title'))).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('the callback', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(navigation, 'search').mockReturnValue('?code=c&state=s');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows that it is finishing while the exchange is in flight', () => {
    vi.spyOn(authService, 'completeLogin').mockImplementation(() => new Promise(() => undefined));

    render(<Callback />);

    expect(screen.getByLabelText(t('auth.callback.pending'))).toBeInTheDocument();
  });

  it('signs the visitor in and goes back to where they started', async () => {
    vi.spyOn(authService, 'completeLogin').mockResolvedValue(session);
    vi.spyOn(authService, 'returnRoute').mockReturnValue('/sessions/01J0');
    const replace = vi.spyOn(navigation, 'replace').mockImplementation(() => undefined);

    render(<Callback />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/sessions/01J0');
    });
    expect(useAuthStore.getState().session).toEqual(session);
  });

  it('shows the translated reason when the state did not match', async () => {
    vi.spyOn(authService, 'completeLogin').mockRejectedValue(
      new AppError('UNAUTHENTICATED', 'auth.error.invalidState', 'trace-1'),
    );

    render(<Callback />);

    await waitFor(() => {
      expect(screen.getByText(t('auth.error.invalidState'))).toBeInTheDocument();
    });
    expect(
      screen.getByText(t('common.error.traceLabel', { traceId: 'trace-1' })),
    ).toBeInTheDocument();
  });

  it('shows something a visitor can act on even for a failure it did not expect', async () => {
    vi.spyOn(authService, 'completeLogin').mockRejectedValue(new Error('boom'));

    render(<Callback />);

    await waitFor(() => {
      expect(screen.getByText(t('common.error.unexpected'))).toBeInTheDocument();
    });
  });
});
