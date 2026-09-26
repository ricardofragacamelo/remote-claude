import { describe, expect, it } from 'vitest';

import { auditLocation, readAuditSearch } from '@/app/AuditRoute';
import { router } from '@/app/router';
import { CALLBACK_PATH } from '@/features/auth';

describe('the routes', () => {
  it('serves the screen at the root', () => {
    expect(Object.keys(router.routesById)).toContain('/');
  });

  it('serves the provider’s callback, at the path the login publishes', () => {
    expect(Object.keys(router.routesById)).toContain(CALLBACK_PATH);
  });

  it('carries the session in the path, so the link reproduces the screen', () => {
    // The test the architecture states: pasting the link on another device brings up the same
    // screen. A session held in a store would fail it.
    expect(Object.keys(router.routesById)).toContain('/sessions/$sessionId');
  });

  it('gives the rules a route of their own, so revoking is one click away — D-04', () => {
    expect(Object.keys(router.routesById)).toContain('/rules');
  });

  it('gives one rule a route of its own, so a trail entry can open it — D-18', () => {
    expect(Object.keys(router.routesById)).toContain('/rules/$ruleId');
  });

  it('gives the trail a route of its own — B-13', () => {
    expect(Object.keys(router.routesById)).toContain('/audit');
  });
});

describe('the filters of the trail, read from the URL', () => {
  it('keeps every well-formed filter', () => {
    expect(
      readAuditSearch({
        sessionId: 'S1',
        toolName: 'Bash',
        decision: 'allowed',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-02T00:00:00.000Z',
      }),
    ).toEqual({
      sessionId: 'S1',
      toolName: 'Bash',
      decision: 'allowed',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-02T00:00:00.000Z',
    });
  });

  it('drops what a hand-edited link says wrongly, rather than sending it', () => {
    expect(
      readAuditSearch({ sessionId: '  ', decision: 'maybe', toolName: 42, extra: 'x' }),
    ).toEqual({});
  });

  it('trims what it keeps', () => {
    expect(readAuditSearch({ toolName: ' Bash ' })).toEqual({ toolName: 'Bash' });
  });
});

describe('the address a sign-in comes back to, from the trail', () => {
  it('is the trail alone when nothing is filtered', () => {
    expect(auditLocation({})).toBe('/audit');
  });

  it('carries every filter, so a filtered link survives the sign-in — S-43', () => {
    expect(auditLocation({ sessionId: 'S1', decision: 'allowed', toolName: 'Write' })).toBe(
      '/audit?sessionId=S1&decision=allowed&toolName=Write',
    );
  });
});
