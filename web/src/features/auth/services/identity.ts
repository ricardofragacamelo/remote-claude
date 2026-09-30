import { logger } from '@/shared/logging/logger';
import type { AuthSession } from '../types/session';

/** The claims of an ID token that name a person, in the order worth showing. */
const NAMING_CLAIMS = ['name', 'preferred_username', 'email'] as const;

/**
 * The claims of an ID token, **for display only**.
 *
 * Nothing here is trusted: the backend validates every token it is sent, and this one authorizes
 * nothing (docs/architecture/shared/08-authentication.md). A token that cannot be read names nobody,
 * and the account menu falls back to the user id.
 */
function claimsOf(idToken: string): Readonly<Record<string, unknown>> {
  try {
    const payload = idToken.split('.')[1] ?? '';
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const text = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    const claims: unknown = JSON.parse(text);

    return typeof claims === 'object' && claims !== null ? (claims as Record<string, unknown>) : {};
  } catch (error) {
    logger.debug({ op: 'auth.identity', err: String(error) }, 'id token claims unreadable');
    return {};
  }
}

/** What to call whoever is signed in: their name, else their username, else their email, else the id. */
export function displayNameOf(session: AuthSession): string {
  const claims = session.idToken === null ? {} : claimsOf(session.idToken);

  for (const claim of NAMING_CLAIMS) {
    const value = claims[claim];

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return session.userId;
}
