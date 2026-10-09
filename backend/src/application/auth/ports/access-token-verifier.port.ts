/** What survives validation of an access token. Never the token itself. */
export interface VerifiedAccessToken {
  /** The `sub` claim: the stable key of the user at the provider. */
  readonly subject: string;

  /** When the credential stops being valid. The socket uses it to schedule its grace period. */
  readonly expiresAt: Date;

  /**
   * The client the token was issued to — the `azp` claim —, or `null` when it carries none. What
   * tells the web from every other client where the rule depends on it: reading the folder
   * ([25 · D-12](../../../../../docs/plans/25-mobile-file-browser/decisions.md#f1--normas-e-a-sessão-encoberta)).
   */
  readonly clientId: string | null;
}

/**
 * Validates an access token against the issuer.
 *
 * The implementation is the only place in the backend that knows what OIDC is, and not even it
 * knows the name of the provider — see docs/architecture/shared/08-authentication.md.
 */
export interface AccessTokenVerifier {
  /**
   * @throws {import('../../../domain/auth').TokenExpiredError} when it is past `exp`
   * @throws {import('../../../domain/auth').UnauthenticatedError} for every other failure
   */
  verify(token: string): Promise<VerifiedAccessToken>;
}

export const ACCESS_TOKEN_VERIFIER = Symbol('AccessTokenVerifier');
