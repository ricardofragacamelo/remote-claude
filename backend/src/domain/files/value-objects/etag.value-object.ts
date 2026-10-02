import { createHash } from 'node:crypto';

/**
 * The version of a file: a **strong** `ETag`, the SHA-256 of its bytes, between quotes.
 *
 * Content and not the clock ([07 · D-03](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)):
 * Claude rewrites a file in the same second and with the same size, and only the hash says for
 * certain that the person is saving over the version they saw. It is the hash of the bytes that
 * were **read**, so a read racing somebody's atomic rename never pairs one version with the hash
 * of another (S-54).
 *
 * `node:crypto` is used and is not I/O: it hashes bytes already in memory.
 */
export class Etag {
  private constructor(readonly value: string) {}

  /** The `ETag` of some contents. */
  static of(content: Uint8Array): Etag {
    return Etag.ofDigest(createHash('sha256').update(content).digest('hex'));
  }

  /**
   * The `ETag` of a SHA-256 already computed — by whoever hashed a file as a stream, rather than
   * holding the whole of it in memory to call {@link of}.
   */
  static ofDigest(sha256Hex: string): Etag {
    return new Etag(`"${sha256Hex}"`);
  }

  /**
   * Whether an `If-Match` names this version — the **strong** comparison RFC 9110 demands of it.
   *
   * A weak tag (`W/"…"`) never matches (S-65), and neither does `*`: the caller refuses `*` before
   * asking, because "any version" is the blind overwrite the header exists to prevent.
   */
  matchedBy(ifMatch: string): boolean {
    return tagsOf(ifMatch).some((tag) => tag === this.value);
  }

  /**
   * Whether an `If-None-Match` names this version — the **weak** comparison, as RFC 9110 has it for
   * a `GET`: `W/"x"` names `"x"`, and `*` names whatever exists. A hit is a `304` (S-52).
   */
  notModifiedFor(ifNoneMatch: string): boolean {
    if (ifNoneMatch.trim() === '*') {
      return true;
    }

    return tagsOf(ifNoneMatch).some((tag) => tag.replace(/^W\//, '') === this.value);
  }

  /** The SHA-256 in hex, without the quotes — how a write of Claude's names what it left. */
  get digest(): string {
    return this.value.slice(1, -1);
  }

  equals(other: Etag): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/** Whether a precondition header is the wildcard, which this API never accepts as a version. */
export function isWildcard(header: string): boolean {
  return header.trim() === '*';
}

/** The entity tags of a header that may list several, each as it was written. */
function tagsOf(header: string): string[] {
  return header
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}
