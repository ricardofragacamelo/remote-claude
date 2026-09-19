import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import {
  PermissionExtensionLimitReachedError,
  PermissionReasonRequiredError,
  PermissionRequest,
  PermissionRequestExpiredError,
  PermissionRequestNotFoundError,
} from '@domain/permission';
import type { PermissionAnswer } from '@domain/permission';
import { SessionId } from '@domain/session';
import { SESSION_ID } from '../../../../support/builders/session.builder';

const now = new Date('2026-09-19T12:00:00.000Z');
const owner = UserId.create('auth|owner');
const other = UserId.create('auth|other');

function aRequest(expiresInMs = 1_000): PermissionRequest {
  return PermissionRequest.open({
    id: 'request-1',
    sessionId: SessionId.create(SESSION_ID),
    userId: owner,
    toolUseId: 'toolu-1',
    toolName: 'Bash',
    input: { command: 'rm -rf build/' },
    riskHint: 'destructive',
    requestedAt: now,
    expiresAt: new Date(now.getTime() + expiresInMs),
  });
}

function anAnswer(overrides: Partial<PermissionAnswer> = {}): PermissionAnswer {
  return {
    decision: 'allow',
    reason: null,
    scope: 'once',
    resolvedBy: owner,
    resolvedFrom: 'web',
    auto: false,
    at: now,
    ...overrides,
  };
}

describe('PermissionRequest', () => {
  it('starts pending, blocking the loop', () => {
    const request = aRequest();

    expect(request.status).toBe('pending');
    expect(request.isPending).toBe(true);
    expect(request.resolution).toBeNull();
  });

  describe('being answered', () => {
    it('takes the first answer and reports it won', () => {
      const request = aRequest();

      expect(request.resolve(anAnswer()).won).toBe(true);
      expect(request.status).toBe('resolved');
    });

    it('keeps the first answer and reports the second lost — S-53', () => {
      // Several clients watch one session and a client may resend after reconnecting. A second
      // answer is a silent ack, never an error and never a second execution.
      const request = aRequest();
      request.resolve(anAnswer({ decision: 'allow' }));

      const second = request.resolve(
        anAnswer({ decision: 'deny', reason: 'no', resolvedBy: other }),
      );

      expect(second.won).toBe(false);
      expect(second.resolution.decision).toBe('allow');
      expect(second.resolution.resolvedBy).toBe(owner);
    });

    it('refuses a refusal with no reason — S-55', () => {
      // The reason goes into the trail and back to Claude as a message; a refusal nobody can
      // account for is a refusal nobody can learn from.
      expect(() => aRequest().resolve(anAnswer({ decision: 'deny', reason: null }))).toThrow(
        PermissionReasonRequiredError,
      );
    });

    it('refuses a refusal whose reason is empty', () => {
      expect(() => aRequest().resolve(anAnswer({ decision: 'deny', reason: '' }))).toThrow(
        PermissionReasonRequiredError,
      );
    });

    it('refuses it even after the request has been settled, because the input is wrong either way', () => {
      const request = aRequest();
      request.resolve(anAnswer());

      expect(() => request.resolve(anAnswer({ decision: 'deny', reason: '' }))).toThrow(
        PermissionReasonRequiredError,
      );
    });
  });

  describe('when the deadline passes', () => {
    it('is refused, by nobody, and reads back as expired — S-51', () => {
      const request = aRequest();

      expect(request.resolve(PermissionRequest.expiry(now)).won).toBe(true);
      expect(request.status).toBe('expired');
      expect(request.resolution).toMatchObject({
        decision: 'deny',
        reason: null,
        resolvedBy: null,
        auto: true,
      });
    });

    it('loses to an answer that arrived first — S-52', () => {
      const request = aRequest();
      request.resolve(anAnswer({ decision: 'allow' }));

      const late = request.resolve(PermissionRequest.expiry(now));

      expect(late.won).toBe(false);
      expect(request.status).toBe('resolved');
    });

    it('is told apart from a refusal somebody made', () => {
      // "Somebody said no" and "nobody said anything" are different answers to a person reading
      // the trail, and the difference is exactly `auto`, `reason` and `resolvedBy` together.
      const refused = aRequest();
      refused.resolve(anAnswer({ decision: 'deny', reason: 'not now' }));

      expect(refused.status).toBe('resolved');
    });
  });

  describe('being extended', () => {
    it('pushes the deadline out and spends one extension — S-91', () => {
      const request = aRequest(1_000);

      const extension = request.extend(2_000, 2, now);

      expect(extension.changed).toBe(true);
      expect(extension.expiresAt).toEqual(new Date(now.getTime() + 2_000));
      expect(extension.remainingExtensions).toBe(1);
      expect(request.extensionsUsed).toBe(1);
    });

    it('spends nothing when the deadline already reaches that far — S-94', () => {
      // The command means "give me `increment` more time from now". Asking twice at the same
      // moment is one act, which is what lets a browser and a phone both press the button on the
      // same countdown without spending two extensions between them.
      const request = aRequest(1_000);
      request.extend(2_000, 2, now);

      const second = request.extend(2_000, 2, now);

      expect(second.changed).toBe(false);
      expect(second.remainingExtensions).toBe(1);
      expect(request.extensionsUsed).toBe(1);
    });

    it('refuses beyond the ceiling — S-92', () => {
      // The deadline is the only protection there is against a session that hangs for ever, so
      // the ceiling is hard: reaching it is an error the UI shows, not a silent no-op.
      const request = aRequest(0);
      request.extend(10, 2, now);
      request.extend(20, 2, now);

      expect(() => request.extend(30, 2, now)).toThrow(PermissionExtensionLimitReachedError);
      expect(request.extensionsUsed).toBe(2);
    });

    it('refuses to extend something already settled — S-93', () => {
      // Not a silent no-op: whoever pressed the button needs to know they did not extend anything.
      const request = aRequest();
      request.resolve(anAnswer());

      expect(() => request.extend(2_000, 2, now)).toThrow(PermissionRequestNotFoundError);
    });

    it('says "too late" rather than "never was" when the deadline already refused it — S-51', () => {
      // `410 Gone`: it existed, it does not any more, and it is not coming back. A different
      // thing to tell somebody than "that was already decided", which is what an answer gives.
      const request = aRequest();
      request.resolve(PermissionRequest.expiry(now));

      expect(() => request.extend(2_000, 2, now)).toThrow(PermissionRequestExpiredError);
    });
  });
});
