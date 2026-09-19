import { describe, expect, it } from 'vitest';

import { toRow } from '@adapter/outbound/persistence/permission/permission-request.mapper';
import { PermissionRequest } from '@domain/permission';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_SESSION,
} from '../../../../../support/builders/permission.builder';

const written = new Date('2026-09-19T12:00:05.000Z');

function aRequest(): PermissionRequest {
  return PermissionRequest.open({
    id: 'request-1',
    sessionId: PERMISSION_SESSION,
    userId: PERMISSION_OWNER,
    toolUseId: 'toolu-1',
    toolName: 'Bash',
    input: { command: 'rm -rf build/' },
    riskHint: 'destructive',
    requestedAt: PERMISSION_NOW,
    expiresAt: new Date(PERMISSION_NOW.getTime() + 1_000),
  });
}

/**
 * The two writes of one row.
 *
 * One function rather than two, because the second differs from the first by exactly the
 * settlement: restating the other eleven columns for the update is how an `open` row and a
 * `settle` row come to disagree about the same request.
 */
describe('the permission request mapper', () => {
  it('writes a question as pending, with nothing decided', () => {
    expect(toRow(aRequest(), written)).toEqual({
      id: 'request-1',
      userId: PERMISSION_OWNER.value,
      sessionId: PERMISSION_SESSION.value,
      toolUseId: 'toolu-1',
      toolName: 'Bash',
      input: { command: 'rm -rf build/' },
      riskHint: 'destructive',
      status: 'pending',
      decision: null,
      reason: null,
      scope: null,
      resolvedBy: null,
      resolvedFrom: null,
      auto: null,
      extensionsUsed: 0,
      requestedAt: PERMISSION_NOW,
      expiresAt: new Date(PERMISSION_NOW.getTime() + 1_000),
      resolvedAt: null,
      updatedAt: written,
    });
  });

  it('writes an answer with its author', () => {
    const request = aRequest();
    request.resolve({
      decision: 'deny',
      reason: 'not now',
      scope: 'session',
      resolvedBy: PERMISSION_OWNER,
      resolvedFrom: 'mobile',
      auto: false,
      at: written,
    });

    expect(toRow(request, written)).toMatchObject({
      status: 'resolved',
      decision: 'deny',
      reason: 'not now',
      scope: 'session',
      resolvedBy: PERMISSION_OWNER.value,
      resolvedFrom: 'mobile',
      auto: false,
      resolvedAt: written,
    });
  });

  it('writes the deadline`s refusal as expired, by nobody', () => {
    const request = aRequest();
    request.resolve(PermissionRequest.expiry(written));

    expect(toRow(request, written)).toMatchObject({
      status: 'expired',
      decision: 'deny',
      reason: null,
      resolvedBy: null,
      resolvedFrom: null,
      auto: true,
    });
  });

  it('keeps the count of extensions, so the history says how long it was held open', () => {
    const request = aRequest();
    request.extend(5_000, 2, PERMISSION_NOW);

    expect(toRow(request, written)).toMatchObject({
      extensionsUsed: 1,
      expiresAt: new Date(PERMISSION_NOW.getTime() + 5_000),
    });
  });
});
