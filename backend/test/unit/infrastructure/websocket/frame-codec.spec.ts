import { describe, expect, it } from 'vitest';

import { decodeFrame, encodeFrame } from '@infra/websocket/frame-codec';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { PayloadTooLargeError } from '@shared/errors/payload-too-large.error';
import { UnsupportedProtocolVersionError } from '@shared/errors/unsupported-protocol-version.error';

/** The limit a default installation announces. */
const LIMIT = 65_536;

const valid = {
  v: 1,
  id: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
  kind: 'command',
  type: 'diag.ping',
  ts: '2026-09-13T12:00:00.000Z',
  payload: { nonce: 'n' },
};

describe('decodeFrame', () => {
  it('accepts a well-formed frame', () => {
    expect(decodeFrame(JSON.stringify(valid), LIMIT)).toMatchObject({ type: 'diag.ping' });
  });

  it('accepts a frame carrying a field this build does not know', () => {
    const frame = decodeFrame(JSON.stringify({ ...valid, somethingNew: true }), LIMIT);

    expect(frame.type).toBe('diag.ping');
  });

  it('refuses text that is not JSON', () => {
    expect(() => decodeFrame('{not json', LIMIT)).toThrow(InputValidationError);
  });

  it.each([
    ['no id', { ...valid, id: undefined }],
    ['no kind', { ...valid, kind: undefined }],
    ['no type', { ...valid, type: undefined }],
    ['no ts', { ...valid, ts: undefined }],
    ['a numeric type', { ...valid, type: 7 }],
  ])('refuses a frame with %s', (_case, frame) => {
    expect(() => decodeFrame(JSON.stringify(frame), LIMIT)).toThrow(InputValidationError);
  });

  it.each([
    ['a future version', 2],
    ['a missing version', undefined],
    ['a version that is a string', '1'],
  ])('refuses %s, so the client can be told to update', (_case, version) => {
    expect(() => decodeFrame(JSON.stringify({ ...valid, v: version }), LIMIT)).toThrow(
      UnsupportedProtocolVersionError,
    );
  });

  it('reports the versions it does speak', () => {
    expect.assertions(1);

    try {
      decodeFrame(JSON.stringify({ ...valid, v: 99 }), LIMIT);
    } catch (error) {
      expect((error as UnsupportedProtocolVersionError).supportedVersions).toEqual([1]);
    }
  });

  it('refuses a frame at one byte over the limit', () => {
    const oversized = JSON.stringify({ ...valid, payload: { nonce: 'x'.repeat(64) } });

    expect(() => decodeFrame(oversized, oversized.length - 1)).toThrow(PayloadTooLargeError);
  });

  it('accepts a frame exactly at the limit', () => {
    const exact = JSON.stringify(valid);

    expect(() => decodeFrame(exact, exact.length)).not.toThrow();
  });

  it('refuses a frame that is not an object', () => {
    expect(() => decodeFrame('"a string"', LIMIT)).toThrow(UnsupportedProtocolVersionError);
  });

  it('refuses null', () => {
    expect(() => decodeFrame('null', LIMIT)).toThrow(UnsupportedProtocolVersionError);
  });
});

describe('encodeFrame', () => {
  it('round-trips a frame', () => {
    expect(
      decodeFrame(encodeFrame(decodeFrame(JSON.stringify(valid), LIMIT)), LIMIT),
    ).toMatchObject({
      id: valid.id,
    });
  });
});
