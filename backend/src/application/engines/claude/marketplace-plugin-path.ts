import { createHash } from 'node:crypto';
import path from 'node:path';

import type { UserId } from '@domain/auth';

/**
 * Whether [value] is safe to use as one path segment on its own — never `.` or `..`, never empty,
 * never carrying a separator of any platform this product runs on (plan 13, B-47; S-204).
 *
 * A marketplace's own `name` already passes through the allowlist file's schema
 * (`^[A-Za-z0-9_-]{1,64}$`) before it ever reaches here, so this exists for the one value that
 * does not: a plugin's name, as a marketplace's own `marketplace.json` — data from a git
 * repository, never fully trusted — declares it.
 */
export function isSafePathSegment(value: string): boolean {
  if (value === '' || value === '.' || value === '..' || value.length > 128) {
    return false;
  }
  return !/[/\\\0]/.test(value);
}

/**
 * Where a marketplace plugin is downloaded to — deterministic, so installing the same plugin twice
 * always targets the same directory (plan 13, B-47; S-207, S-208), and the existing `(userId, path)`
 * uniqueness the store already has (B-27) is what makes a concurrent install of it safe.
 *
 * The user segment is a digest of the subject claim, never the claim itself: `sub` is not
 * guaranteed to be safe as a single path segment (unlike {@link isSafePathSegment}'s other two
 * callers, it is never validated against that shape — it comes from the identity provider, not from
 * a file this product already refuses untrusted characters in), and a digest never needs to be.
 */
export function marketplacePluginDestination(
  baseDir: string,
  userId: UserId,
  marketplace: string,
  pluginName: string,
): string {
  const userSegment = createHash('sha256').update(userId.value).digest('hex').slice(0, 32);
  return path.join(baseDir, userSegment, marketplace, pluginName);
}
