import { InvalidSessionIdError } from '../errors/invalid-session-id.error';

/** Crockford base32, as ULID defines it: 26 characters, without I, L, O and U. */
const ULID = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

/**
 * Identity of a session.
 *
 * A pure rule with no I/O, which is the point: "is this a session id?" is answered without a
 * database, a socket or a framework. See docs/architecture/backend/01-clean-architecture.md.
 */
export class SessionId {
  private constructor(readonly value: string) {}

  /**
   * @param raw candidate identifier, as it arrived from the outside
   * @throws {InvalidSessionIdError} when it is not a ULID
   */
  static create(raw: string): SessionId {
    if (!ULID.test(raw)) {
      throw new InvalidSessionIdError(raw);
    }

    return new SessionId(raw);
  }

  equals(other: SessionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
