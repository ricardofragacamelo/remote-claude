import { describe, expect, it } from 'vitest';

import { Etag, isWildcard } from '@domain/files';

const one = Etag.of(Buffer.from('one\n'));

describe('Etag', () => {
  it('is the SHA-256 of the bytes, quoted, and the same for the same bytes — S-53', () => {
    expect(one.value).toMatch(/^"[0-9a-f]{64}"$/);
    expect(Etag.of(Buffer.from('one\n')).equals(one)).toBe(true);
    expect(Etag.of(Buffer.from('two\n')).equals(one)).toBe(false);
    expect(one.toString()).toBe(one.value);
  });

  it('is the same whether hashed whole or as a stream', () => {
    const hex = one.value.slice(1, -1);

    expect(Etag.ofDigest(hex).equals(one)).toBe(true);
    expect(one.digest).toBe(hex);
  });

  describe('If-Match — strong', () => {
    it('matches its own tag, alone or in a list', () => {
      expect(one.matchedBy(one.value)).toBe(true);
      expect(one.matchedBy(`"other", ${one.value}`)).toBe(true);
    });

    it('never matches a weak tag, even of the same bytes — S-65', () => {
      expect(one.matchedBy(`W/${one.value}`)).toBe(false);
    });

    it('never matches another tag, nor the wildcard, nor nothing', () => {
      expect(one.matchedBy('"other"')).toBe(false);
      expect(one.matchedBy('*')).toBe(false);
      expect(one.matchedBy(' , ')).toBe(false);
    });
  });

  describe('If-None-Match — weak', () => {
    it('is not modified for its own tag, its weak form, a list holding it and *', () => {
      expect(one.notModifiedFor(one.value)).toBe(true);
      expect(one.notModifiedFor(`W/${one.value}`)).toBe(true);
      expect(one.notModifiedFor(`"x", ${one.value}`)).toBe(true);
      expect(one.notModifiedFor(' * ')).toBe(true);
    });

    it('is modified for any other tag — S-52', () => {
      expect(one.notModifiedFor('"x"')).toBe(false);
    });
  });

  it('knows the wildcard when it sees it', () => {
    expect(isWildcard(' * ')).toBe(true);
    expect(isWildcard(one.value)).toBe(false);
  });
});
