/** What the provider hands back from the token endpoint. */
export interface IssuedTokens {
  readonly accessToken: string;

  /**
   * Present only when `offline_access` was granted. Rotation is the provider's, and reuse of a
   * rotated token revokes the whole family — so it is never stored anywhere a script can read.
   */
  readonly refreshToken: string | null;

  /** Lifetime of the access token, in seconds, as the provider reported it. */
  readonly expiresInSeconds: number;
}

/** Everything the backend asks the identity provider to do on behalf of a browser. */
export interface IdentityProvider {
  /**
   * Trades an authorization code for tokens, completing the PKCE flow the browser started.
   *
   * @throws {import('../../../domain/auth').UnauthenticatedError} when the provider refuses
   */
  exchangeAuthorizationCode(input: AuthorizationCodeExchange): Promise<IssuedTokens>;

  /**
   * Rotates a refresh token.
   *
   * @throws {import('../../../domain/auth').UnauthenticatedError} when the provider refuses
   */
  refresh(refreshToken: string): Promise<IssuedTokens>;
}

/** The half of the PKCE exchange the browser cannot do without exposing the code verifier. */
export interface AuthorizationCodeExchange {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

export const IDENTITY_PROVIDER = Symbol('IdentityProvider');
