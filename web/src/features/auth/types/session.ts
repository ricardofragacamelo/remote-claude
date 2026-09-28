/** Who is signed in, and until when. The refresh token is not here — it is in an httpOnly cookie. */
export interface AuthSession {
  readonly accessToken: string;
  readonly userId: string;
  readonly expiresAt: number;

  /**
   * The ID token of the login, in memory like the access token. It authorizes nothing: its one use
   * is naming, to the provider's `end_session_endpoint`, which session the logout ends.
   */
  readonly idToken: string | null;
}

/** What the backend answers after an exchange or a renewal. */
export interface SessionDto {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly userId: string;
  readonly idToken: string | null;
}
