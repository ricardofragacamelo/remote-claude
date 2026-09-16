import { useCallback, useEffect } from 'react';

import { navigation } from '@/shared/lib/navigation';
import { logger } from '@/shared/logging/logger';
import { beginLogin, endSession, renewSession } from '../services/auth.service';
import { renewalDelay, useAuthStore } from '../store/auth.store';
import type { AuthSession } from '../types/session';

/** What a component knows about the sign-in. Not one word of it mentions OIDC. */
export interface Auth {
  readonly userId: string | null;
  readonly isAuthenticated: boolean;
  readonly isResolving: boolean;
  readonly accessToken: string | null;
  login(returnTo: string): Promise<void>;
  logout(): Promise<void>;
}

/**
 * The sign-in, as the components see it.
 *
 * Renewal is **proactive** — around four fifths of the way through the token's life. Waiting for a
 * `401` turns every ordinary expiry into a visible failure.
 */
export function useAuth(): Auth {
  const status = useAuthStore((state) => state.status);
  const session = useAuthStore((state) => state.session);
  const signedIn = useAuthStore((state) => state.signedIn);
  const signedOut = useAuthStore((state) => state.signedOut);

  // On first load, a refresh cookie may already exist: try once before deciding nobody is here.
  useEffect(() => {
    if (status !== 'unknown') {
      return;
    }

    let cancelled = false;

    void renewSession()
      .then((renewed: AuthSession) => {
        if (!cancelled) {
          signedIn(renewed);
        }
      })
      .catch(() => {
        if (!cancelled) {
          signedOut();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, signedIn, signedOut]);

  useEffect(() => {
    if (session === null) {
      return;
    }

    const timer = setTimeout(() => {
      void renewSession()
        .then(signedIn)
        .catch(() => {
          // A failed renewal is the end of the session; recovering in silence would hide it.
          logger.warn({ op: 'auth.token' }, 'renewal failed — signing out');
          signedOut();
        });
    }, renewalDelay(session));

    return () => clearTimeout(timer);
  }, [session, signedIn, signedOut]);

  const login = useCallback(async (returnTo: string) => {
    navigation.assign(await beginLogin(returnTo));
  }, []);

  const logout = useCallback(async () => {
    await endSession();
    signedOut();
  }, [signedOut]);

  return {
    userId: session?.userId ?? null,
    isAuthenticated: status === 'authenticated',
    isResolving: status === 'unknown',
    accessToken: session?.accessToken ?? null,
    login,
    logout,
  };
}
