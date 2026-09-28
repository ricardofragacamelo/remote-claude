import { UnauthenticatedError } from '@domain/auth';
import type { Clock } from '@domain/shared';
import type { AuthenticateUseCase } from './authenticate.use-case';
import type { EstablishedSession } from './establish-session.use-case';
import type { IdentityProvider } from './ports/identity-provider.port';

/**
 * How long a rotation keeps answering the token it replaced.
 *
 * The window between the backend rotating a refresh token and the browser receiving the new cookie
 * is network latency, and a tab whose request left in that window still carries the old one. Sent
 * to the provider, that is a reuse — the whole family revoked, every tab signed out — for a user who
 * did nothing but have two tabs open. Ten seconds covers the latency with room, and is what a
 * stolen copy of the old token can buy: the session that was already issued, for ten seconds, and
 * no more ([D-12 of plan 05](../../../../docs/plans/05-hardening-operations/decisions.md)).
 */
export const ROTATION_GRACE_MS = 10_000;

/** A rotation, and when it settled — or `null` while it is still in flight. */
interface Rotation {
  readonly session: Promise<EstablishedSession>;
  settledAt: number | null;
}

/**
 * Rotates the credential of a browser session.
 *
 * A request with no refresh token is refused here, before the provider is called: asking the
 * provider about an absent credential is a round trip that can only ever fail.
 *
 * **Every presentation of one token inside a rotation is one call to the provider** (S-28, S-76).
 * Every tab of a browser shares the cookie, so several of them renewing at once all present the same
 * refresh token — and refresh tokens rotate: a second presentation would be a reuse, and the
 * provider answers reuse by revoking the whole family. The product would be tripping its own leak
 * detector. So a token already being rotated gets that rotation, and so does one presented up to
 * {@link ROTATION_GRACE_MS} after it succeeded. Past that, the old token is a genuine reuse and goes
 * to the provider to be treated as one. A refusal is never remembered: the next caller asks again.
 */
export class RenewSessionUseCase {
  /** Keyed by the refresh token itself; it lives in memory only, and is never logged. */
  private readonly rotations = new Map<string, Rotation>();

  constructor(
    private readonly provider: IdentityProvider,
    private readonly authenticate: AuthenticateUseCase,
    private readonly clock: Clock,
  ) {}

  /**
   * @param refreshToken as read from the cookie, or `null` when there was none
   * @throws {UnauthenticatedError} when there is no token, or the provider refuses it
   */
  async execute(refreshToken: string | null): Promise<EstablishedSession> {
    if (refreshToken === null) {
      throw new UnauthenticatedError('no refresh token on the request');
    }

    this.forgetExpired();

    const known = this.rotations.get(refreshToken);
    if (known !== undefined) {
      return known.session;
    }

    const rotation: Rotation = {
      session: this.rotate(refreshToken).then(
        (session) => {
          rotation.settledAt = this.clock.now().getTime();
          return session;
        },
        (error: unknown) => {
          this.rotations.delete(refreshToken);
          throw error;
        },
      ),
      settledAt: null,
    };
    this.rotations.set(refreshToken, rotation);

    return rotation.session;
  }

  private forgetExpired(): void {
    const now = this.clock.now().getTime();

    for (const [token, rotation] of this.rotations) {
      if (rotation.settledAt !== null && now - rotation.settledAt >= ROTATION_GRACE_MS) {
        this.rotations.delete(token);
      }
    }
  }

  private async rotate(refreshToken: string): Promise<EstablishedSession> {
    const issued = await this.provider.refresh(refreshToken);
    const { userId } = await this.authenticate.execute(issued.accessToken);

    return { ...issued, userId };
  }
}
