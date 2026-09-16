import { UnauthenticatedError } from '@domain/auth';
import type { AuthenticateUseCase } from './authenticate.use-case';
import type { EstablishedSession } from './establish-session.use-case';
import type { IdentityProvider } from './ports/identity-provider.port';

/**
 * Rotates the credential of a browser session.
 *
 * A request with no refresh token is refused here, before the provider is called: asking the
 * provider about an absent credential is a round trip that can only ever fail.
 */
export class RenewSessionUseCase {
  constructor(
    private readonly provider: IdentityProvider,
    private readonly authenticate: AuthenticateUseCase,
  ) {}

  /**
   * @param refreshToken as read from the cookie, or `null` when there was none
   * @throws {UnauthenticatedError} when there is no token, or the provider refuses it
   */
  async execute(refreshToken: string | null): Promise<EstablishedSession> {
    if (refreshToken === null) {
      throw new UnauthenticatedError('no refresh token on the request');
    }

    const issued = await this.provider.refresh(refreshToken);
    const { userId } = await this.authenticate.execute(issued.accessToken);

    return { ...issued, userId };
  }
}
