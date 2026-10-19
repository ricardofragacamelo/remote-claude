import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  decryptedFieldOf,
  encryptedRowOf,
} from '@adapter/outbound/persistence/mcp/mcp-server.repository';
import { encryptValue } from '@shared/crypto/aes-gcm-cipher';

const KEY = randomBytes(32);

describe('encryptedRowOf / decryptedFieldOf — plan 13, D-02', () => {
  it('stores an empty value as three NULL columns, needing no key', () => {
    const row = encryptedRowOf('srv-1', 'env', { name: 'X', value: '' }, null, 0);
    expect(row).toMatchObject({
      serverId: 'srv-1',
      kind: 'env',
      name: 'X',
      ciphertext: null,
      iv: null,
      tag: null,
    });
  });

  it('encrypts a non-empty value with the key given', () => {
    const row = encryptedRowOf('srv-1', 'env', { name: 'X', value: 'secret' }, KEY, 0);
    expect(row.ciphertext).not.toBeNull();
    expect(row.ciphertext?.toString('latin1')).not.toContain('secret');
  });

  it('refuses a non-empty value with no key — its own invariant, never a configuration error', () => {
    expect(() => encryptedRowOf('srv-1', 'env', { name: 'X', value: 'secret' }, null, 0)).toThrow(
      /without a key/,
    );
  });

  it('round-trips through decryptedFieldOf with the same key', () => {
    const encrypted = encryptValue(KEY, 'secret');
    const row = {
      name: 'X',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
    };
    expect(decryptedFieldOf(row, KEY)).toEqual({ name: 'X', value: 'secret' });
  });

  it('decrypts a row with NULL columns back to an empty value, needing no key', () => {
    const row = { name: 'X', ciphertext: null, iv: null, tag: null };
    expect(decryptedFieldOf(row, null)).toEqual({ name: 'X', value: '' });
  });

  it('refuses to decrypt an encrypted row with no key', () => {
    const encrypted = encryptValue(KEY, 'secret');
    const row = {
      name: 'X',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
    };
    expect(() => decryptedFieldOf(row, null)).toThrow(/without a key/);
  });
});
