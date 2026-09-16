/** Who is signed in, and until when. The refresh token is not here — it is in an httpOnly cookie. */
export interface AuthSession {
  readonly accessToken: string;
  readonly userId: string;
  readonly expiresAt: number;
}

/** What the backend answers after an exchange or a renewal. */
export interface SessionDto {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly userId: string;
}
