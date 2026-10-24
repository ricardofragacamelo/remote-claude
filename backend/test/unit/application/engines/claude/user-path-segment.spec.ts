import { describe, expect, it } from 'vitest';

import { userPathSegment } from '@application/engines/claude';
import { UserId } from '@domain/auth';

describe('userPathSegment — plan 13, B-35, B-47', () => {
  it('is the same, deterministic value for the same user', () => {
    const userId = UserId.create('auth|owner');
    expect(userPathSegment(userId)).toBe(userPathSegment(userId));
  });

  it('differs between two different users', () => {
    expect(userPathSegment(UserId.create('auth|owner'))).not.toBe(
      userPathSegment(UserId.create('auth|someone-else')),
    );
  });

  it('is a safe, fixed-length path segment — hex only, never the claim itself', () => {
    const segment = userPathSegment(UserId.create('auth|weird/char|here'));
    expect(segment).toMatch(/^[0-9a-f]{32}$/);
  });
});
