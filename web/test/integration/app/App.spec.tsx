import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { App } from '@/app/App';
import { Callback } from '@/app/Callback';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { AppError } from '@/shared/api/errors';
import { navigation } from '@/shared/lib/navigation';
import { render, renderRouted, translator } from '../../support/render';

const t = translator('en');

const session = { accessToken: 'a', userId: 'auth|42', expiresAt: Date.now() + 900_000 };

describe('the shell', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits rather than deciding, while the sign-in is still unknown', async () => {
    vi.spyOn(authService, 'renewSession').mockImplementation(() => new Promise(() => undefined));

    renderRouted(<App />);

    // `findBy` and not `getBy`: the router resolves its first route asynchronously, so the shell
    // is mounted one tick after the render call rather than inside it.
    expect(await screen.findByLabelText(t('auth.callback.pending'))).toBeInTheDocument();
  });

  it('signs the visitor in from the refresh cookie when there is one', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);

    renderRouted(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('session.ping.action') })).toBeInTheDocument();
    });
  });

  it('leads a signed-in visitor to the rules they granted', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const user = userEvent.setup();
    const mounted = renderRouted(<App />);

    await user.click(await screen.findByRole('link', { name: t('rules.screen.open') }));

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules');
    });
  });

  it('asks the visitor to sign in when there is no session to resume', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));

    renderRouted(<App />);

    await waitFor(() => {
      expect(screen.getByText(t('auth.signIn.title'))).toBeInTheDocument();
    });
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));
    const { container } = renderRouted(<App />);

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
