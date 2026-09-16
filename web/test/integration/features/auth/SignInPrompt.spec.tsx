import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { SignInPrompt, useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { navigation } from '@/shared/lib/navigation';
import { render, translator } from '../../../support/render';

const t = translator('en');

describe('the sign-in screen', () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // The visitor is known to be anonymous, so the hook does not try to renew on mount.
    useAuthStore.setState({ status: 'anonymous', session: null });
    assign = vi.fn();
    vi.spyOn(navigation, 'assign').mockImplementation(assign);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('explains why it is asking before it asks', () => {
    render(<SignInPrompt returnTo="/" />);

    expect(screen.getByText(t('auth.signIn.description'))).toBeInTheDocument();
  });

  it('sends the browser to the provider when the visitor asks to sign in', async () => {
    vi.spyOn(authService, 'beginLogin').mockResolvedValue('https://provider.test/authorize?x=1');

    render(<SignInPrompt returnTo="/sessions/01J0" />);
    await userEvent.click(screen.getByRole('button', { name: t('auth.signIn.action') }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://provider.test/authorize?x=1');
    });
  });

  it('remembers where the visitor was going', async () => {
    const beginLogin = vi
      .spyOn(authService, 'beginLogin')
      .mockResolvedValue('https://provider.test/authorize');

    render(<SignInPrompt returnTo="/sessions/01J0" />);
    await userEvent.click(screen.getByRole('button', { name: t('auth.signIn.action') }));

    await waitFor(() => {
      expect(beginLogin).toHaveBeenCalledWith('/sessions/01J0');
    });
  });

  it('offers a touch target big enough for a phone', () => {
    render(<SignInPrompt returnTo="/" />);

    expect(screen.getByRole('button', { name: t('auth.signIn.action') }).className).toContain(
      'h-11',
    );
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<SignInPrompt returnTo="/" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
