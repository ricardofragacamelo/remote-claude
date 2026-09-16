import { describe, expect, it } from 'vitest';

import { TokenExpiredError, UnauthenticatedError } from '@domain/auth';
import { InvalidSessionIdError, SessionNotFoundError } from '@domain/session';
import { hasDetails, httpStatusFor, toErrorEnvelope } from '@shared/errors/error-catalogue';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { PayloadTooLargeError } from '@shared/errors/payload-too-large.error';

describe('httpStatusFor', () => {
  it.each([
    ['UNAUTHENTICATED', 401],
    ['TOKEN_EXPIRED', 401],
    ['FORBIDDEN', 403],
    ['WORKSPACE_NOT_ALLOWED', 403],
    ['SESSION_NOT_FOUND', 404],
    ['PERMISSION_REQUEST_EXPIRED', 410],
    ['PAYLOAD_TOO_LARGE', 413],
    ['WORKSPACE_NOT_A_DIRECTORY', 422],
    ['SESSION_LOCKED', 423],
    ['RATE_LIMITED', 429],
    ['INVALID_INPUT', 400],
    ['CLAUDE_UNAVAILABLE', 502],
    ['CLAUDE_TIMEOUT', 504],
    ['INTERNAL_ERROR', 500],
  ])('maps %s to %i', (code, status) => {
    expect(httpStatusFor(code)).toBe(status);
  });

  it('treats an uncatalogued code as our own bug, not the caller’s', () => {
    expect(httpStatusFor('SOMETHING_WE_FORGOT')).toBe(500);
  });
});

describe('toErrorEnvelope', () => {
  it('carries the code, the key and the trace', () => {
    const envelope = toErrorEnvelope(new TokenExpiredError(), 'trace-1');

    expect(envelope.error).toMatchObject({
      code: 'TOKEN_EXPIRED',
      messageKey: 'auth.error.tokenExpired',
      traceId: 'trace-1',
      httpEquivalent: 401,
    });
  });

  it('includes the parameters when the error has any', () => {
    const envelope = toErrorEnvelope(new SessionNotFoundError('01J0'), 'trace-1');

    expect(envelope.error.params).toEqual({ sessionId: '01J0' });
  });

  it('leaves `params` out when there are none', () => {
    expect(toErrorEnvelope(new TokenExpiredError(), 'trace-1').error).not.toHaveProperty('params');
  });

  it('lists every invalid field for a validation failure', () => {
    const error = new InputValidationError([
      { field: 'nonce', rule: 'required' },
      { field: 'sessionId', rule: 'invalid_format' },
    ]);

    expect(toErrorEnvelope(error, 'trace-1').error.details).toHaveLength(2);
  });

  it('turns anything it does not recognise into INTERNAL_ERROR', () => {
    const envelope = toErrorEnvelope(new Error('connection to 10.0.0.4 refused'), 'trace-1');

    expect(envelope.error.code).toBe('INTERNAL_ERROR');
    expect(envelope.error.httpEquivalent).toBe(500);
  });

  it('never leaks the internal message, the stack or a server path', () => {
    const error = new Error('ENOENT /srv/remote-claude/secret.key');
    error.stack = 'Error: at /srv/remote-claude/src/main.ts:12';

    const serialised = JSON.stringify(toErrorEnvelope(error, 'trace-1'));

    expect(serialised).not.toContain('/srv/remote-claude');
    expect(serialised).not.toContain('ENOENT');
    expect(serialised).not.toContain('stack');
  });

  it('quotes the same status a domain error would carry over HTTP', () => {
    expect(toErrorEnvelope(new PayloadTooLargeError(100, 10), 't').error.httpEquivalent).toBe(413);
    expect(toErrorEnvelope(new InvalidSessionIdError('x'), 't').error.httpEquivalent).toBe(400);
    expect(toErrorEnvelope(new UnauthenticatedError('why'), 't').error.httpEquivalent).toBe(401);
  });
});

describe('hasDetails', () => {
  it('recognises an error carrying a field list', () => {
    expect(hasDetails(new InputValidationError([]))).toBe(true);
  });

  it.each([
    ['a plain error', new Error('x')],
    ['null', null],
    ['a string', 'nope'],
    ['an object with a non-list `details`', { details: 'nope' }],
  ])('does not recognise %s', (_case, value) => {
    expect(hasDetails(value)).toBe(false);
  });
});
