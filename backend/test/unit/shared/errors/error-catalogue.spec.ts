import { describe, expect, it } from 'vitest';

import { TokenExpiredError, UnauthenticatedError } from '@domain/auth';
import {
  InvalidSessionIdError,
  SessionLimitReachedError,
  SessionNotFoundError,
} from '@domain/session';
import { OpenFoldersLimitReachedError, WorkspaceDirectoryUnreadableError } from '@domain/workspace';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  hasDetails,
  httpStatusFor,
  retryAfterFor,
  toErrorEnvelope,
} from '@shared/errors/error-catalogue';
import { RateLimitedError } from '@shared/errors/rate-limited.error';
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
    ['WORKSPACE_DIRECTORY_UNREADABLE', 422],
    ['OPEN_FOLDERS_LIMIT_REACHED', 409],
    ['CONFLICT', 409],
    ['SESSION_LOCKED', 423],
    ['RATE_LIMITED', 429],
    ['SESSION_LIMIT_REACHED', 429],
    ['SERVICE_UNAVAILABLE', 503],
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

describe('retryAfterFor — S-12', () => {
  it('carries the wait the error declared', () => {
    const envelope = toErrorEnvelope(new RateLimitedError('frames', 20, 10), 'trace-1');

    expect(retryAfterFor(429, envelope)).toBe(10);
  });

  it('rounds a fraction of a second up, never down to "at once"', () => {
    const envelope = toErrorEnvelope(new RateLimitedError('frames', 20, 0.2), 'trace-1');

    expect(retryAfterFor(429, envelope)).toBe(1);
  });

  it('gives the session limit half a minute', () => {
    const envelope = toErrorEnvelope(new SessionLimitReachedError(4), 'trace-1');

    expect(retryAfterFor(429, envelope)).toBe(30);
  });

  it('answers a second for a 429 or a 503 whose error did not say', () => {
    const envelope = toErrorEnvelope(new Error('unknown'), 'trace-1');

    expect(retryAfterFor(429, envelope)).toBe(DEFAULT_RETRY_AFTER_SECONDS);
    expect(retryAfterFor(503, envelope)).toBe(DEFAULT_RETRY_AFTER_SECONDS);
  });

  it.each([400, 404, 413, 500])('promises nothing for a %i', (status) => {
    const envelope = toErrorEnvelope(new RateLimitedError('frames', 20, 10), 'trace-1');

    expect(retryAfterFor(status, envelope)).toBeNull();
  });
});

describe('RateLimitedError', () => {
  it('is RATE_LIMITED, says what was over which limit, and how long to wait', () => {
    const error = new RateLimitedError('attachedSessions', 16, 1);

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.messageKey).toBe('common.error.rateLimited');
    expect(error.params).toEqual({ scope: 'attachedSessions', limit: 16, retryAfterSeconds: 1 });
  });
});

describe('the codes the workbench adds — plan 06, B-03', () => {
  it('answers a directory the process may not read as impossible, not as unauthorised', () => {
    // The allowlist already said yes: it is the filesystem that refuses, and another token would
    // not change that. `403` would send the client looking for a permission it already has.
    expect(
      toErrorEnvelope(new WorkspaceDirectoryUnreadableError('/srv/p/locked'), 't').error,
    ).toEqual({
      code: 'WORKSPACE_DIRECTORY_UNREADABLE',
      messageKey: 'workspace.error.directoryUnreadable',
      params: { path: '/srv/p/locked' },
      traceId: 't',
      httpEquivalent: 422,
    });
  });

  it('answers one folder tab too many as a conflict, and says the ceiling', () => {
    expect(toErrorEnvelope(new OpenFoldersLimitReachedError(8), 't').error).toEqual({
      code: 'OPEN_FOLDERS_LIMIT_REACHED',
      messageKey: 'workspace.error.openFoldersLimitReached',
      params: { limit: 8 },
      traceId: 't',
      httpEquivalent: 409,
    });
  });
});
