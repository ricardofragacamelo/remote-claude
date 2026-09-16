import { InvalidUserIdError } from '../errors/invalid-user-id.error';

/**
 * Who the caller is, anchored on the `sub` claim of the identity provider.
 *
 * `sub` is the key, never the e-mail: an e-mail changes, and some providers let a freed address
 * be reused. See docs/architecture/shared/08-authentication.md.
 */
export class UserId {
  private constructor(readonly value: string) {}

  /**
   * @param raw the `sub` claim
   * @throws {InvalidUserIdError} when the claim is empty or only whitespace
   */
  static create(raw: string): UserId {
    if (raw.trim() === '') {
      throw new InvalidUserIdError();
    }

    return new UserId(raw);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
