import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  CiphertextTamperedError,
  InvalidEncryptionKeyError,
  decryptValue,
  encryptValue,
} from '@shared/crypto/aes-gcm-cipher';

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

describe('aes-gcm-cipher — plan 13, D-02', () => {
  it('round-trips a value through the same key', () => {
    const encrypted = encryptValue(KEY, 'super-secret-token');
    expect(decryptValue(KEY, encrypted)).toBe('super-secret-token');
  });

  it('round-trips an empty string', () => {
    const encrypted = encryptValue(KEY, '');
    expect(decryptValue(KEY, encrypted)).toBe('');
  });

  it('never stores the plaintext inside the ciphertext', () => {
    const encrypted = encryptValue(KEY, 'super-secret-token');
    expect(encrypted.ciphertext.toString('latin1')).not.toContain('super-secret-token');
  });

  it('encrypts the same value differently every time — a fresh IV each call', () => {
    const first = encryptValue(KEY, 'same-value');
    const second = encryptValue(KEY, 'same-value');
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
    expect(first.iv.equals(second.iv)).toBe(false);
  });

  it('refuses to decrypt with the wrong key', () => {
    const encrypted = encryptValue(KEY, 'super-secret-token');
    expect(() => decryptValue(OTHER_KEY, encrypted)).toThrow(CiphertextTamperedError);
  });

  it('refuses a ciphertext whose tag was tampered with', () => {
    const encrypted = encryptValue(KEY, 'super-secret-token');
    const tampered = { ...encrypted, tag: Buffer.from(encrypted.tag) };
    tampered.tag[0] = (tampered.tag[0] ?? 0) ^ 0xff;
    expect(() => decryptValue(KEY, tampered)).toThrow(CiphertextTamperedError);
  });

  it('refuses a ciphertext whose bytes were tampered with', () => {
    const encrypted = encryptValue(KEY, 'super-secret-token');
    const tampered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => decryptValue(KEY, tampered)).toThrow(CiphertextTamperedError);
  });

  it.each([[16], [24], [31], [33], [0]])('refuses a key that is not 32 bytes (%i)', (length) => {
    const badKey = randomBytes(length);
    expect(() => encryptValue(badKey, 'x')).toThrow(InvalidEncryptionKeyError);
    expect(() => decryptValue(badKey, encryptValue(KEY, 'x'))).toThrow(InvalidEncryptionKeyError);
  });
});
