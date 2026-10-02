import { describe, expect, it } from 'vitest';

import {
  BINARY_PROBE_BYTES,
  byteOrderMarkOf,
  endOfLineOf,
  isUtf8,
  looksBinary,
  markOf,
} from '@domain/files';

describe('the shape of a text', () => {
  it('sees a NUL in the first 8 KB, and only there — S-44, S-45', () => {
    expect(looksBinary(Uint8Array.from([0x41, 0x00, 0x42]))).toBe(true);
    expect(
      looksBinary(Buffer.concat([Buffer.alloc(BINARY_PROBE_BYTES, 0x41), Buffer.from([0])])),
    ).toBe(false);
    expect(looksBinary(new Uint8Array())).toBe(false);
  });

  it('reads the mark of UTF-8 — S-47', () => {
    expect(byteOrderMarkOf(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]))).toEqual({
      encoding: 'utf8',
      length: 3,
    });
  });

  it('reads the marks of UTF-16, little and big end — S-48', () => {
    expect(byteOrderMarkOf(Uint8Array.from([0xff, 0xfe, 0x61, 0x00]))).toEqual({
      encoding: 'utf16le',
      length: 2,
    });
    expect(byteOrderMarkOf(Uint8Array.from([0xfe, 0xff, 0x00, 0x61]))).toEqual({
      encoding: 'utf16be',
      length: 2,
    });
  });

  it('sees no mark where there is none, or only half of one', () => {
    expect(byteOrderMarkOf(Uint8Array.from([0x61]))).toBeNull();
    expect(byteOrderMarkOf(Uint8Array.from([0xef, 0xbb]))).toBeNull();
  });

  it('writes the mark of each encoding that has one, and nothing for another', () => {
    expect([...markOf('utf8')]).toEqual([0xef, 0xbb, 0xbf]);
    expect([...markOf('utf16le')]).toEqual([0xff, 0xfe]);
    expect([...markOf('utf16be')]).toEqual([0xfe, 0xff]);
    expect([...markOf('latin1' as never)]).toEqual([]);
  });

  it('tells valid UTF-8 from what is not — S-46', () => {
    expect(isUtf8(Buffer.from('ação'))).toBe(true);
    expect(isUtf8(Uint8Array.from([0x61, 0xe7, 0xe3, 0x6f]))).toBe(false);
  });

  it('reports CRLF, LF and both — S-51', () => {
    expect(endOfLineOf('a\r\nb\r\n')).toBe('crlf');
    expect(endOfLineOf('a\nb\n')).toBe('lf');
    expect(endOfLineOf('a\r\nb\n')).toBe('mixed');
    expect(endOfLineOf('no line break')).toBe('lf');
  });
});
