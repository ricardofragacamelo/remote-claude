/**
 * A rule's `ETag` — derived from `expiresAt` and `revokedAt`, the only two fields `PATCH` and
 * revoking ever change, with no version column of its own ([15 · B-02]).
 *
 * Not cryptographic, deliberately: nothing here needs to resist a deliberate collision, only to
 * change whenever either field does and agree with itself on the same two values — a plain
 * checksum is the honest tool for that, not a hash meant for secrets.
 */
export function ruleEtag(rule: {
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}): string {
  const basis = `${rule.expiresAt.getTime()}:${rule.revokedAt === null ? 'none' : rule.revokedAt.getTime()}`;
  let checksum = 0;

  for (let index = 0; index < basis.length; index += 1) {
    checksum = (checksum * 31 + basis.charCodeAt(index)) >>> 0;
  }

  return checksum.toString(16);
}
