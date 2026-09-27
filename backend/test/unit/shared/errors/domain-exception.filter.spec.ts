import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { normaliseException } from '@shared/errors/domain-exception.filter';
import { FrameworkHttpError } from '@shared/errors/framework-http.error';
import { SessionNotFoundError } from '@domain/session';

describe('normaliseException', () => {
  it('keeps a domain error as it is', () => {
    const error = new SessionNotFoundError('s-1');

    expect(normaliseException(error)).toBe(error);
  });

  it("says what Nest raised in the catalogue's words", () => {
    expect(normaliseException(new NotFoundException())).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reads a request error of the body parser as the 4xx it carries — plan 05, F1', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });

    expect(normaliseException(tooLarge)).toBeInstanceOf(FrameworkHttpError);
    expect(normaliseException(tooLarge)).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it.each([
    ['not marked safe to expose', { status: 413, expose: false }],
    ['a server status', { status: 502, expose: true }],
    ['no numeric status', { status: '413', expose: true }],
  ])('leaves an error that is %s to be ours to explain', (_what, fields) => {
    const error = Object.assign(new Error('x'), fields);

    expect(normaliseException(error)).toBe(error);
  });

  it('leaves anything that is not an object alone', () => {
    expect(normaliseException('boom')).toBe('boom');
    expect(normaliseException(null)).toBeNull();
  });
});
