import { UserId } from '@domain/auth';
import type { AccessTokenVerifier } from './ports/access-token-verifier.port';

/** Who the caller is, and until when the credential holds. */
export interface Authentication {
  readonly userId: UserId;
  readonly expiresAt: Date;
}

/**
 * Turns an access token into an identity.
 *
 * There is no password anywhere in this system: the backend is a Resource Server, it validates
 * what the provider issued and never issues anything itself.
 */
export class AuthenticateUseCase {
  constructor(private readonly verifier: AccessTokenVerifier) {}

  async execute(token: string): Promise<Authentication> {
    const verified = await this.verifier.verify(token);

    return { userId: UserId.create(verified.subject), expiresAt: verified.expiresAt };
  }
}
