import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/features/auth/store/auth.store';
import * as authService from '@/features/auth/services/auth.service';
import { AppError } from '@/shared/api/errors';
import { navigation } from '@/shared/lib/navigation';

import type { AuthSession } from '@/features/auth';

const session: AuthSession = {
  accessToken: 'token-1',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
};

describe('useAuth', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('is still resolving before the first renewal has answered', () => {
    vi.spyOn(authService, 'renewSession').mockImplementation(() => new Promise(() => undefined));

    const { result } = renderHook(() => useAuth());

    expect(result.current.isResolving).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('resumes a session from the refresh cookie', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
    expect(result.current.userId).toBe('auth|42');
    expect(result.current.accessToken).toBe('token-1');
  });

  it('settles on anonymous when there is nothing to resume', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isResolving).toBe(false);
    });
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('tries the cookie once, not on every render', async () => {
    const renew = vi.spyOn(authService, 'renewSession').mockResolvedValue(session);

    const { rerender, result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    rerender();

    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('renews before the credential expires, not after a request has failed', async () => {
    vi.useFakeTimers();
    const renewed = { ...session, accessToken: 'token-2' };
    const renew = vi
      .spyOn(authService, 'renewSession')
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(renewed);

    renderHook(() => useAuth());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Four fifths of a fifteen-minute life: well before the token stops working.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900_000 * 0.8 + 10);
    });

    expect(renew).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().session?.accessToken).toBe('token-2');
  });

  it('signs the visitor out when a renewal fails, rather than recovering in silence', async () => {
    vi.useFakeTimers();
    vi.spyOn(authService, 'renewSession')
      .mockResolvedValueOnce(session)
      .mockRejectedValueOnce(new AppError('X', 'k', 't'));

    renderHook(() => useAuth());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900_000);
    });

    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('schedules nothing while nobody is signed in', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.accessToken).toBeNull();
  });

  it('starts the login and leaves for the provider', async () => {
    vi.spyOn(authService, 'renewSession').mockRejectedValue(new AppError('X', 'k', 't'));
    vi.spyOn(authService, 'beginLogin').mockResolvedValue('https://provider.test/authorize');
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isResolving).toBe(false));
    await act(async () => {
      await result.current.login('/sessions/01J0');
    });

    expect(assign).toHaveBeenCalledWith('https://provider.test/authorize');
  });

  it('drops the cookie and the session on sign-out', async () => {
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    const endSession = vi.spyOn(authService, 'endSession').mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    await act(async () => {
      await result.current.logout();
    });

    expect(endSession).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('ignores an answer that arrives after the screen is gone', async () => {
    let settle: (resumed: AuthSession) => void = () => undefined;
    vi.spyOn(authService, 'renewSession').mockImplementation(
      () => new Promise((resolve) => (settle = resolve)),
    );

    const { unmount } = renderHook(() => useAuth());
    unmount();
    await act(async () => {
      settle(session);
      await Promise.resolve();
    });

    expect(useAuthStore.getState().status).toBe('unknown');
  });
});
