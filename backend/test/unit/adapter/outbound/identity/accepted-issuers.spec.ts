import { describe, expect, it } from 'vitest';

import { AcceptedIssuers } from '@adapter/outbound/identity/accepted-issuers';
import { UnauthenticatedError } from '@domain/auth';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { ISSUER } from '../../../../support/identity/fake-oidc';
import { StubFetch } from '../../../../support/identity/stub-fetch';

const THROUGH_WEB = 'http://localhost:5173/realms/remote-claude';

/**
 * The explicit list of accepted issuers — ADR-021, plan 10 B-26.
 *
 * The verifier's suite proves what the list does to a token; this one, what the list is.
 */
describe('AcceptedIssuers', () => {
  const clock = new FixedClock(new Date('2026-10-03T12:00:00.000Z'));

  it('makes the first issuer the primary one — the web signs in with it (S-88)', () => {
    const issuers = new AcceptedIssuers([ISSUER, THROUGH_WEB], clock, new StubFetch().fetch);

    expect(issuers.primary.issuer).toBe(ISSUER);
    expect(issuers.of(ISSUER)).toBe(issuers.primary);
  });

  it('gives every issuer a discovery and a key set of its own (S-89, S-90)', () => {
    const issuers = new AcceptedIssuers([ISSUER, THROUGH_WEB], clock, new StubFetch().fetch);
    const web = issuers.of(THROUGH_WEB);

    expect(web.issuer).toBe(THROUGH_WEB);
    expect(web.discovery).not.toBe(issuers.primary.discovery);
    expect(web.jwks).not.toBe(issuers.primary.jwks);
  });

  it('finds an issuer with or without its trailing slash, on either side', () => {
    const issuers = new AcceptedIssuers([`${ISSUER}/`], clock, new StubFetch().fetch);

    expect(issuers.of(ISSUER)).toBe(issuers.primary);
    expect(issuers.of(`${ISSUER}/`)).toBe(issuers.primary);
  });

  it.each([
    ['an issuer outside the list', 'http://localhost:9999/realms/remote-claude'],
    ['an issuer that only shares a prefix', `${ISSUER}-other`],
    ['no issuer at all', undefined],
    ['an issuer that is not a string', 42],
  ])('refuses %s, naming the claim for the log (S-87)', (_what, claimed) => {
    const issuers = new AcceptedIssuers([ISSUER, THROUGH_WEB], clock, new StubFetch().fetch);

    expect(() => issuers.of(claimed)).toThrow(UnauthenticatedError);
    expect(() => issuers.of(claimed)).toThrow('"iss"');
  });

  it('cannot be built empty — the configuration refuses that before it gets here (S-88)', () => {
    expect(() => new AcceptedIssuers([], clock)).toThrow('at least one issuer');
  });
});
