import { describe, expect, it } from 'vitest';

import { UnauthenticatedError, TokenExpiredError } from '@domain/auth';
import { DomainError } from '@domain/shared';
import { SessionNotFoundError } from '@domain/session';

describe('DomainError', () => {
  it('carries a code, a message key and parameters', () => {
    const error = new SessionNotFoundError('01J0ABCDEFGHJKMNPQRSTVWXYZ');

    expect(error.code).toBe('SESSION_NOT_FOUND');
    expect(error.messageKey).toBe('session.error.notFound');
    expect(error.params).toEqual({ sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ' });
  });

  it('defaults to no parameters', () => {
    expect(new TokenExpiredError().params).toEqual({});
  });

  it('names itself after its own class, so a log line says which error it was', () => {
    expect(new TokenExpiredError().name).toBe('TokenExpiredError');
  });

  it('keeps the technical reason in the message, for the log and not for the client', () => {
    expect(new UnauthenticatedError('audience mismatch').message).toContain('audience mismatch');
  });

  it('is an Error, so it travels through anything that catches one', () => {
    expect(new TokenExpiredError()).toBeInstanceOf(DomainError);
    expect(new TokenExpiredError()).toBeInstanceOf(Error);
  });
});
