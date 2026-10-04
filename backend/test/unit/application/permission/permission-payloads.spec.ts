import { describe, expect, it } from 'vitest';

import type { PermissionResolution } from '@domain/permission';
import { resolvedPayload } from '@application/permission/permission-payloads';

/** A rule answered: automatic, no origin, no author. */
const byRule: PermissionResolution = {
  decision: 'allow',
  reason: null,
  scope: 'always',
  resolvedBy: null,
  resolvedFrom: null,
  auto: true,
  at: new Date('2026-10-04T12:00:00.000Z'),
};

describe('resolvedPayload — the settlement as `permission.resolved` carries it', () => {
  it('names the tool the request was about, so its line can say how it ended (plan 10, B-20)', () => {
    expect(resolvedPayload({ id: 'request-1', toolUseId: 'toolu-1' }, byRule)).toEqual({
      requestId: 'request-1',
      decision: 'allow',
      auto: true,
      toolUseId: 'toolu-1',
    });
  });

  it('leaves the tool out, rather than null or empty, when the SDK named none', () => {
    expect(resolvedPayload({ id: 'request-1', toolUseId: null }, byRule)).not.toHaveProperty(
      'toolUseId',
    );
    expect(resolvedPayload({ id: 'request-1', toolUseId: '' }, byRule)).not.toHaveProperty(
      'toolUseId',
    );
  });
});
