import { describe, expect, it } from 'vitest';

import { FrameworkHttpError } from '@shared/errors/framework-http.error';

describe('FrameworkHttpError', () => {
  it.each([
    [400, 'INVALID_INPUT'],
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [429, 'RATE_LIMITED'],
  ])('says HTTP %i in our vocabulary as %s', (status, code) => {
    expect(new FrameworkHttpError(status).code).toBe(code);
  });

  it('carries a translation key for every mapped status', () => {
    expect(new FrameworkHttpError(404).messageKey).toBe('common.error.notFound');
  });

  it('treats an unmapped status as our own fault', () => {
    const error = new FrameworkHttpError(418);

    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.messageKey).toBe('common.error.unexpected');
  });
});
