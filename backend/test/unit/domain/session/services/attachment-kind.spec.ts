import { describe, expect, it } from 'vitest';

import { attachmentKindOf } from '@domain/session';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('what an upload is, by its bytes — plan 08, B-45', () => {
  it.each([
    ['image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['image/gif', text('GIF89a\u0000')],
    ['image/webp', text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')],
  ])('takes %s as an image — S-206', (mediaType, content) => {
    expect(attachmentKindOf(content)).toEqual({ kind: 'image', mediaType });
  });

  it('takes UTF-8 text as text — S-207', () => {
    expect(attachmentKindOf(text('olá, mundo\n'))).toEqual({
      kind: 'text',
      mediaType: 'text/plain',
    });
  });

  it.each([
    ['image/svg+xml', text('<?xml version="1.0"?><svg xmlns="x"></svg>')],
    ['application/pdf', text('%PDF-1.4\n')],
    ['image/bmp', bytes(0x42, 0x4d, 1, 2, 3, 4, 0, 0, 0, 0)],
    ['application/octet-stream', bytes(1, 2, 0, 3)],
    ['application/octet-stream', bytes(0xc3, 0x28)],
  ])('refuses %s — S-209', (mediaType, content) => {
    expect(attachmentKindOf(content)).toEqual({ kind: 'unsupported', mediaType });
  });

  it('refuses a text with a NUL past the first bytes the sniff reads', () => {
    const late = new Uint8Array(9000).fill(0x61);
    late[8999] = 0;

    expect(attachmentKindOf(late).kind).toBe('unsupported');
  });
});
