import type { UserId } from '@domain/auth';
import type { AuthenticateUseCase } from './authenticate.use-case';
import type {
  AuthorizationCodeExchange,
  IdentityProvider,
  IssuedTokens,
} from './ports/identity-provider.port';

/** The tokens, plus who they turned out to belong to. */
export interface EstablishedSession extends IssuedTokens {
  readonly userId: UserId;
}

/**
 * Completes the browser's PKCE login.
 *
 * The exchange happens here rather than in the browser for one reason: the refresh token has to
 * land in an `httpOnly` cookie, and only a server can set one. A single-page application that
 * holds its own refresh token holds it somewhere a script can read.
 * See docs/architecture/web/07-auth.md.
 */
export class EstablishSessionUseCase {
  constructor(
    private readonly provider: IdentityProvider,
    private readonly authenticate: AuthenticateUseCase,
  ) {}

  async execute(input: AuthorizationCodeExchange): Promise<EstablishedSession> {
    const issued = await this.provider.exchangeAuthorizationCode(input);

    // The access token is validated even though it was just minted: the code path that trusts a
    // token because of where it came from is the one that eventually trusts the wrong one.
    const { userId } = await this.authenticate.execute(issued.accessToken);

    return { ...issued, userId };
  }
}
