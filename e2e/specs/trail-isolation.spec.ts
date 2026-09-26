import { expect, test } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { openSignedIn, signIn } from '../fixtures/auth';
import { approvedPhone } from '../fixtures/devices';
import { environment } from '../fixtures/environment';
import { closeSession, connected, startSession, workspaceFor } from '../fixtures/live-session';
import { countRows, plantEntries, purge, withDatabase } from '../fixtures/retention';
import { revokingEveryRuleAfterEach, trailOf, writeTurn } from '../fixtures/rules';
import type { ListedRule } from '../fixtures/rules';
import type { E2eSocket } from '../fixtures/ws';
import type { ScenarioUser } from '../scenarios';
import { scenario } from '../scenarios';

/**
 * What the trail must never do — plan 03, F4 (B-23): show one person another's session, count one
 * revocation twice, or lose the trail of a session that is still open to the purge.
 *
 * The purge is reached as somebody at the terminal reaches it, `pnpm db purge`, and the database is
 * touched only where no door of the product answers: to plant a row ninety days old, and to count the
 * revocations the account trail recorded, which no screen lists.
 */

const otherUser = scenario('rules-other-user-trail');
const revokeRace = scenario('mobile-rule-revoke-race');
const openSession = scenario('rules-purge-open-session');

const context = workspaceFor(otherUser.user);

revokingEveryRuleAfterEach(() => context().user);

/** A session of this user, opened from the browser, with one write already in its trail. */
async function sessionWithATrail(): Promise<{ socket: E2eSocket; sessionId: string }> {
  const socket = await connected(context().user);
  const sessionId = await startSession(socket, context().workspace);
  await writeTurn(socket, sessionId, { decision: 'allow', scope: 'once' });
  return { socket, sessionId };
}

test(`${otherUser.id} — ${otherUser.title}`, async ({ browser, page }) => {
  const expected = otherUser.expect as {
    stranger: ScenarioUser;
    status: number;
    code: string;
    message: string;
  };
  const { socket, sessionId } = await sessionWithATrail();
  await closeSession(socket, sessionId);
  expect((await trailOf(context().user, sessionId)).length).toBeGreaterThan(0);

  // Pointed at by somebody else, through the API: refused, and said why.
  const stranger = await signIn(browser, expected.stranger);
  const refused = await callApi(
    stranger,
    `/audit-entries?${new URLSearchParams({ sessionId }).toString()}`,
  );
  expect(refused.status).toBe(expected.status);
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(expected.code);

  // Not pointed at, it is simply not there: their own trail holds nothing of that session.
  const ownTrail = await callApi(stranger, '/audit-entries?limit=100');
  expect(ownTrail.status).toBe(200);
  const own = (await ownTrail.json()) as { entries: readonly { sessionId: string }[] };
  expect(own.entries.some((entry) => entry.sessionId === sessionId)).toBe(false);

  // And through the screen, from the link a person would be sent.
  await openSignedIn(
    page,
    expected.stranger,
    `/audit?${new URLSearchParams({ sessionId }).toString()}`,
  );
  await expect(page.getByText(expected.message)).toBeVisible();
});

test(`${revokeRace.id} — ${revokeRace.title}`, async () => {
  const expected = revokeRace.expect as { status: number; revocations: number };
  const user = context().user;
  const phone = await approvedPhone(user);

  const granted = await callApi(user, '/permission-rules', {
    method: 'POST',
    body: { pattern: 'Write(/workspace/e2e-revoke-race.md)', decision: 'allow', scope: 'always' },
  });
  expect(granted.status).toBe(201);
  const rule = (await granted.json()) as ListedRule;

  // The browser and the phone, at the same moment.
  const [fromTheWeb, fromThePhone] = await Promise.all([
    callApi(user, `/permission-rules/${rule.id}`, { method: 'DELETE' }),
    callApi(user, `/permission-rules/${rule.id}`, { method: 'DELETE', installId: phone.installId }),
  ]);

  expect([fromTheWeb.status, fromThePhone.status]).toEqual([expected.status, expected.status]);
  const [toTheWeb, toThePhone] = (await Promise.all([fromTheWeb.json(), fromThePhone.json()])) as [
    ListedRule,
    ListedRule,
  ];

  // Both ends are told the same revocation — the one the rule keeps.
  expect(toThePhone).toEqual(toTheWeb);
  expect(toTheWeb).toMatchObject({ id: rule.id, status: 'revoked', revokedAt: expect.any(String) });
  const described = (await (
    await callApi(user, `/permission-rules/${rule.id}`)
  ).json()) as ListedRule;
  expect(described.revokedAt).toBe(toTheWeb.revokedAt);

  // And the account trail recorded it once.
  const recorded = await countRows(
    environment.databaseUrl,
    `SELECT count(*)::text AS "count" FROM "audit_events"
     WHERE "kind" = 'permission.ruleRevoked' AND "subject_id" = $1`,
    [rule.id],
  );
  expect(recorded).toBe(expected.revocations);
});

test(`${openSession.id} — ${openSession.title}`, async () => {
  const expected = openSession.expect as { plantedDaysAgo: number };
  const tag = `e2e-open-session-${String(Date.now())}`;
  await withDatabase(environment.databaseUrl, (pool) =>
    plantEntries(pool, tag, expected.plantedDaysAgo),
  );

  const { socket, sessionId } = await sessionWithATrail();

  try {
    const before = await trailOf(context().user, sessionId);
    expect(before.length).toBeGreaterThan(0);

    const run = purge(environment.databaseUrl);
    expect(run.code, run.stdout).toBe(0);

    // The purge did its job — the planted row is gone — and left the open session's trail whole.
    const planted = await countRows(
      environment.databaseUrl,
      `SELECT count(*)::text AS "count" FROM "audit_entries" WHERE "session_id" = $1`,
      [tag],
    );
    expect(planted).toBe(0);
    expect(await trailOf(context().user, sessionId)).toEqual(before);

    // And the session goes on writing its trail afterwards.
    await writeTurn(socket, sessionId, { decision: 'allow', scope: 'once' });
    const after = await trailOf(context().user, sessionId);
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.slice(-before.length)).toEqual(before);
  } finally {
    await closeSession(socket, sessionId);
  }
});
