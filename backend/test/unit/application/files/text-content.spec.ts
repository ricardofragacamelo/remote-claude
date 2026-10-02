import { describe, expect, it } from 'vitest';

import { canonicalEncoding, decodeText, encodeText } from '@application/files';
import { FileNotEncodableError, FileNotTextError, UnknownEncodingError } from '@domain/files';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';

const codec = new IconvTextCodec();
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

describe('text of a file — D-04', () => {
  it('names an encoding canonically', () => {
    expect(canonicalEncoding('UTF-8')).toBe('utf8');
    expect(canonicalEncoding('Windows_1252')).toBe('windows1252');
  });

  describe('decodeText', () => {
    it('reads valid UTF-8 with no mark, and its endings', () => {
      expect(decodeText('a', Buffer.from('a\r\nb'), null, codec)).toEqual({
        content: 'a\r\nb',
        encoding: 'utf8',
        bom: false,
        eol: 'crlf',
      });
    });

    it('takes a mark out only when it belongs to the encoding the text is read in — S-47, S-48', () => {
      expect(decodeText('a', bytes(0xef, 0xbb, 0xbf, 0x61), null, codec)).toMatchObject({
        content: 'a',
        bom: true,
      });
      expect(decodeText('a', bytes(0xff, 0xfe, 0x61, 0x00), null, codec)).toMatchObject({
        content: 'a',
        encoding: 'utf16le',
        bom: true,
      });
      expect(decodeText('a', bytes(0xef, 0xbb, 0xbf, 0x61), 'windows-1252', codec)).toMatchObject({
        bom: false,
        encoding: 'windows1252',
      });
    });

    it('reads UTF-16 asked for without a mark, NULs and all', () => {
      expect(decodeText('a', bytes(0x61, 0x00, 0x62, 0x00), 'utf-16le', codec).content).toBe('ab');
    });

    it('refuses a binary, and invalid UTF-8 when nothing was asked — S-44, S-46', () => {
      expect(() => decodeText('a', bytes(0x61, 0x00), null, codec)).toThrow(FileNotTextError);
      expect(() => decodeText('a', bytes(0x61, 0x00), 'windows-1252', codec)).toThrow(
        FileNotTextError,
      );
      expect(() => decodeText('a', bytes(0xe3), null, codec)).toThrow(FileNotTextError);
    });

    it('refuses an encoding it does not know — S-50', () => {
      expect(() => decodeText('a', bytes(0x61), 'klingon', codec)).toThrow(UnknownEncodingError);
    });
  });

  describe('encodeText', () => {
    it('writes the mark only for an encoding that has one, and only when asked — S-72', () => {
      expect([...encodeText('a', 'a', 'utf8', true, codec)]).toEqual([0xef, 0xbb, 0xbf, 0x61]);
      expect([...encodeText('a', 'a', 'utf8', false, codec)]).toEqual([0x61]);
      expect([...encodeText('a', 'a', 'utf-16be', true, codec)]).toEqual([0xfe, 0xff, 0x00, 0x61]);
      expect([...encodeText('a', 'a', 'windows-1252', true, codec)]).toEqual([0x61]);
    });

    it('refuses a character the encoding cannot hold, and an encoding it does not know — S-73', () => {
      expect(() => encodeText('a', '🙂', 'windows-1252', false, codec)).toThrow(
        FileNotEncodableError,
      );
      expect(() => encodeText('a', 'a', 'klingon', false, codec)).toThrow(UnknownEncodingError);
    });

    it('never writes a lone surrogate as a replacement character', () => {
      expect(() => encodeText('a', '\ud800', 'utf8', false, codec)).toThrow(FileNotEncodableError);
    });
  });
});
