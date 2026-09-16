import { z } from 'zod';

/**
 * The half of the PKCE exchange the browser hands to the backend.
 *
 * The verifier crosses this boundary once and is never stored: it exists only between the
 * redirect and the callback. See docs/architecture/web/07-auth.md.
 */
export const establishSessionSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: z.url(),
});

export type EstablishSessionDto = z.infer<typeof establishSessionSchema>;

/** What the browser gets back. The refresh token is **not** here — it is in the cookie. */
export interface SessionDto {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly userId: string;
}
