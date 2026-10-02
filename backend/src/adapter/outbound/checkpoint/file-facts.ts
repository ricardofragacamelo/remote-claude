import { createHash } from 'node:crypto';

/** SHA-256 of some contents, in hex — the hash every half of the undo compares by. */
export function digestOf(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Whether a failure to look at a path means there is nothing there, rather than that we could not
 * look.
 *
 * `ENOTDIR` counts: a path under something that is no longer a directory holds no file either.
 */
export function isAbsent(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;

  return code === 'ENOENT' || code === 'ENOTDIR';
}
