import { readFile } from 'node:fs/promises';

const KEY_LENGTH = 32;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** The key file for MCP secrets is missing, unreadable, or not a 32-byte key once decoded. */
export class UnusableMcpSecretKeyError extends Error {
  constructor(file: string) {
    super(`the MCP secret key at ${file} is missing or unusable`);
    this.name = 'UnusableMcpSecretKeyError';
  }
}

/**
 * Reads the key a server's env and header values are encrypted with: a file of base64, decoding to
 * exactly 32 bytes (plan 13, D-02) — the discipline of the push credential (plan 02, D-20): a file,
 * never a variable, and read lazily rather than at boot. A backend with no key file still starts; a
 * server **with** a secret is simply not stored until there is one ({@link
 * import('@domain/mcp').SecretStoreUnavailableError}).
 *
 * Never echoes what it read: a malformed key file is still a file that may contain a near-miss of a
 * real key, and a message quoting it would put the near-miss in a log.
 *
 * @throws {UnusableMcpSecretKeyError} missing, unreadable, or the wrong size once decoded
 */
export async function readMcpSecretKey(file: string): Promise<Buffer> {
  let raw: string;

  try {
    raw = (await readFile(file, 'utf8')).trim();
  } catch {
    throw new UnusableMcpSecretKeyError(file);
  }

  if (!BASE64_PATTERN.test(raw)) {
    throw new UnusableMcpSecretKeyError(file);
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new UnusableMcpSecretKeyError(file);
  }

  return key;
}
