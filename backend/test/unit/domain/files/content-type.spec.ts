import { describe, expect, it } from 'vitest';

import { OCTET_STREAM, PLAIN_TEXT, SVG, contentTypeOf, isPreviewable } from '@domain/files';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const text = (value: string): Uint8Array => Buffer.from(value, 'utf8');

/**
 * The type of `GET /files/raw`, read from the bytes and never from the name — plan 07, B-48,
 * D-18: a short list, and never `text/html`.
 */
describe('contentTypeOf', () => {
  it.each([
    ['image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['image/gif', text('GIF87a…')],
    ['image/gif', text('GIF89a…')],
    ['image/webp', Buffer.concat([text('RIFF'), bytes(1, 2, 3, 4), text('WEBPVP8 ')])],
    ['image/bmp', Buffer.concat([text('BM'), bytes(0x36, 0, 0, 0, 0, 0, 0, 0)])],
    ['image/x-icon', bytes(0x00, 0x00, 0x01, 0x00, 0x01)],
    ['application/pdf', text('%PDF-1.7\n')],
  ])('reads %s from its signature — S-293', (type, head) => {
    expect(contentTypeOf(head, true)).toBe(type);
  });

  it('serves UTF-8 text as plain text, whatever it says — an HTML page included — S-296', () => {
    expect(contentTypeOf(text('<!doctype html><script>alert(1)</script>'), true)).toBe(PLAIN_TEXT);
    expect(contentTypeOf(text('olá, mundo\n'), true)).toBe(PLAIN_TEXT);
    expect(contentTypeOf(new Uint8Array(0), true)).toBe(PLAIN_TEXT);
  });

  it('does not take a text that starts with BM for a bitmap', () => {
    expect(contentTypeOf(text('BMW, and other cars'), true)).toBe(PLAIN_TEXT);
  });

  it.each([
    ['a bare root', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['a declaration first', '<?xml version="1.0"?>\n<svg>'],
    ['a comment and a doctype first', '﻿ <!-- made by hand --><!DOCTYPE svg><svg/>'],
  ])('reads an SVG with %s', (_name, document) => {
    expect(contentTypeOf(text(document), true)).toBe(SVG);
  });

  it('keeps a text that only mentions <svg further on as text', () => {
    expect(contentTypeOf(text('# Icons\n\nUse <svg> for them.\n'), true)).toBe(PLAIN_TEXT);
  });

  it('serves what has a NUL, or is not UTF-8, as bytes to save', () => {
    expect(contentTypeOf(bytes(0x61, 0x00, 0x62), true)).toBe(OCTET_STREAM);
    expect(contentTypeOf(bytes(0x61, 0xe7, 0xe3, 0x6f), true)).toBe(OCTET_STREAM);
  });

  it('forgives a character cut at the end of the probe of a longer file — fron', () => {
    const cut = Buffer.concat([text('ação'), Buffer.from('ç', 'utf8').subarray(0, 1)]);

    expect(contentTypeOf(cut, false)).toBe(PLAIN_TEXT);
    expect(contentTypeOf(cut, true)).toBe(OCTET_STREAM);
    // Two of the three bytes of '€': a lead byte and one continuation.
    expect(contentTypeOf(Buffer.from([0x61, 0xe2, 0x82]), false)).toBe(PLAIN_TEXT);
  });

  it('does not forgive a tail that is not the start of a character', () => {
    expect(contentTypeOf(Buffer.concat([text('abc'), bytes(0x41, 0xff)]), false)).toBe(
      OCTET_STREAM,
    );
    expect(contentTypeOf(bytes(0xff), false)).toBe(OCTET_STREAM);
  });
});

describe('isPreviewable', () => {
  it('lets images, SVG, PDF and text be shown, and nothing else — S-296', () => {
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable(SVG)).toBe(true);
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable(PLAIN_TEXT)).toBe(true);
    expect(isPreviewable(OCTET_STREAM)).toBe(false);
  });
});
