import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
/** The full GCM tag, in bytes — pinned explicitly so a shorter one is never silently accepted. */
const TAG_LENGTH = 16;

/** One value, encrypted: never kept beside the key that opens it. */
export interface EncryptedValue {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
}

/** A key that is not exactly 32 bytes — AES-256 has no other size. */
export class InvalidEncryptionKeyError extends Error {
  constructor() {
    super(`an AES-256-GCM key must be exactly ${String(KEY_LENGTH)} bytes`);
    this.name = 'InvalidEncryptionKeyError';
  }
}

/** The ciphertext, its IV or its tag do not agree with the key — altered, or the wrong key. */
export class CiphertextTamperedError extends Error {
  constructor() {
    super('the ciphertext or its tag do not match the key — it was altered, or the key changed');
    this.name = 'CiphertextTamperedError';
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_LENGTH) {
    throw new InvalidEncryptionKeyError();
  }
}

/**
 * Encrypts [plaintext] with [key] (plan 13, D-02): a fresh random IV every call, so the same value
 * encrypted twice never looks the same on disk. Pure with respect to anything but randomness — no
 * I/O, no knowledge of where [key] came from.
 *
 * @throws {InvalidEncryptionKeyError} [key] is not 32 bytes
 */
export function encryptValue(key: Buffer, plaintext: string): EncryptedValue {
  assertKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

/**
 * The plaintext [encrypted] decrypts to, with [key].
 *
 * The tag length is pinned to {@link TAG_LENGTH} on both ends — never left to whatever [encrypted]
 * claims — so a shorter, attacker-shortened tag can never be checked against fewer bits than the
 * algorithm promises (the forgery `gcm-no-tag-length` warns about).
 *
 * @throws {InvalidEncryptionKeyError} [key] is not 32 bytes
 * @throws {CiphertextTamperedError} the tag is the wrong size, does not verify, or the key is wrong
 */
export function decryptValue(key: Buffer, encrypted: EncryptedValue): string {
  assertKey(key);
  if (encrypted.tag.length !== TAG_LENGTH) {
    throw new CiphertextTamperedError();
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, encrypted.iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(encrypted.tag);
    return Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    throw new CiphertextTamperedError();
  }
}
