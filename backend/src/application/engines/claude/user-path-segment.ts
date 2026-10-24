import { createHash } from 'node:crypto';

import type { UserId } from '@domain/auth';

/**
 * A user's own digest, safe to use as one path segment on its own — never the claim itself: `sub`
 * is not guaranteed to be safe as a single path segment (it comes from the identity provider, not
 * from a file this product already refuses untrusted characters in), and a digest never needs to be.
 * Shared by every per-user directory this extension builds on disk (plan 13, B-47's marketplace
 * plugin destination; B-35's synthetic skills plugin).
 */
export function userPathSegment(userId: UserId): string {
  return createHash('sha256').update(userId.value).digest('hex').slice(0, 32);
}
