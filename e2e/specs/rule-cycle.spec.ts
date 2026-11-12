import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { approvedPhone, connectedPhone } from '../fixtures/devices';
import {
  attachFrom,
  closeSession,
  connected,
  startSession,
  workspaceFor,
} from '../fixtures/live-session';
import { callApi } from '../fixtures/api';
import { environment } from '../fixtures/environment';
import {
  expectRanUnasked,
  offeredPattern,
  onlyOne,
  requestIdOf,
  revokingEveryRuleAfterEach,
  ruleGrantedFor,
  rulesOf,
  trailOf,
  writeTurn,
} from '../fixtures/rules';
import type { Answer, ListedRule, Turn } from '../fixtures/rules';
import type { E2eSocket } from '../fixtures/ws';
import { scenario } from '../scenarios';

/**
 * The cycle of a rule, through the doors a person uses — plan 03, F4 (B-20…B-22).
 *
 * Granting, not being asked, reading what was done, revoking, being asked again. Each step is a
 * real turn of a live session on the scripted backend, and each assertion is about what a screen
 * would show: which questions went out, which settlements came back, and what the trail says.
 *
 * The rules here are `always`, because that is the scope the cycle is about — and an `always` rule
 * that outlived a failed case would answer every later spec's write on this stack. So every case
 * ends by taking back whatever rules this user still holds, whatever happened.
 */

const always = scenario('rules-always');
const revokedLive = scenario('rules-revoked-live');
const trail = scenario('rules-trail');
const fromThePhone = scenario('mobile-rule-from-phone');

const context = workspaceFor(always.user);

revokingEveryRuleAfterEach(() => context().user);

/** "Don't ask again anywhere" — the answer the cycle starts with. */
const ALLOW_ALWAYS: Answer = { decision: 'allow', scope: 'always' };

/** A session of this user, opened from the browser. */
async function openedSession(): Promise<{ socket: E2eSocket; sessionId: string }> {
  const socket = await connected(context().user);
  return { socket, sessionId: await startSession(socket, context().workspace) };
}

/** The rule a granting turn left standing, and what it says about itself. */
async function ruleLeftBy(turn: Turn): Promise<ListedRule> {
  const rule = await ruleGrantedFor(context().user, offeredPattern(onlyOne(turn.asked), 'always'));

  expect(rule).toMatchObject({
    scope: 'always',
    status: 'active',
    grantedBy: context().user.userId,
  });
  return rule;
}

test(`${always.id} — ${always.title}`, async () => {
  const first = await openedSession();
  let rule: ListedRule;

  try {
    rule = await ruleLeftBy(await writeTurn(first.socket, first.sessionId, ALLOW_ALWAYS));
  } finally {
    await closeSession(first.socket, first.sessionId);
  }

  // Another session, opened after the first one ended: what answers now is the rule that
  // outlived it — a `session` rule would have died with the first one.
  const second = await openedSession();
  try {
    expectRanUnasked(await writeTurn(second.socket, second.sessionId, null));
    expect((await rulesOf(context().user)).map((standing) => standing.id)).toContain(rule.id);
  } finally {
    await closeSession(second.socket, second.sessionId);
  }
});

test(`${revokedLive.id} — ${revokedLive.title}`, async ({ page }) => {
  const { socket, sessionId } = await openedSession();

  try {
    const rule = await ruleLeftBy(await writeTurn(socket, sessionId, ALLOW_ALWAYS));
    expectRanUnasked(await writeTurn(socket, sessionId, null));

    // Revoked where a person revokes it: the rules screen of the browser — the rule's own detail
    // page now (B-22), not an inline button on a plain list item plan 03 drew (every row's own
    // actions are a right-click context menu today, `RowActionsMenu`; the detail panel's own
    // always-visible Revoke button is the simpler, equally honest door to the same write).
    await openSignedIn(page, revokedLive.user, '/rules?tab=active&sort=grantedAt&order=desc');
    const patternCell = page.getByText(rule.pattern, { exact: true });
    await expect(patternCell).toBeVisible();
    await patternCell.locator('xpath=ancestor::tr').dblclick();
    await page.waitForURL(`**/rules/${rule.id}*`);
    await page.getByRole('button', { name: 'Revoke' }).click();

    await page.goto(`${environment.webUrl}/rules?tab=active&sort=grantedAt&order=desc`);
    await expect(page.getByText(rule.pattern, { exact: true })).toBeHidden();

    // The same session, never restarted: the next write is put to a person again.
    const asked = await writeTurn(socket, sessionId, {
      decision: 'deny',
      scope: 'once',
      reason: 'asked again after the revocation',
    });
    expect(asked.asked).toHaveLength(1);
    expect(asked.resolved.map((frame) => frame.payload)).toEqual([
      expect.objectContaining({ decision: 'deny', auto: false, resolvedFrom: 'web' }),
    ]);

    const described = await callApi(context().user, `/permission-rules/${rule.id}`);
    expect(await described.json()).toMatchObject({ status: revokedLive.expect['revokedStatus'] });
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${trail.id} — ${trail.title}`, async ({ page }) => {
  const expected = trail.expect as {
    toolName: string;
    decision: string;
    unasked: string;
    byRule: string;
    openRule: string;
    revokedStatus: string;
  };
  const { socket, sessionId } = await openedSession();
  let rule: ListedRule;
  let unasked: Turn;

  try {
    rule = await ruleLeftBy(await writeTurn(socket, sessionId, ALLOW_ALWAYS));
    unasked = await writeTurn(socket, sessionId, null);
    expectRanUnasked(unasked);
  } finally {
    await closeSession(socket, sessionId);
  }

  // The API: the write nobody was asked about is there, marked, and tied to the rule.
  const decided = (await trailOf(context().user, sessionId)).filter(
    (entry) => entry.toolName === expected.toolName && entry.decision === expected.decision,
  );
  expect(decided.find((entry) => entry.verdict?.auto === true)).toMatchObject({
    verdict: {
      auto: true,
      ruleId: rule.id,
      scope: 'always',
      requestId: requestIdOf(onlyOne(unasked.resolved)),
    },
  });
  expect(decided.find((entry) => entry.verdict?.auto === false)).toMatchObject({
    verdict: { auto: false, resolvedFrom: 'web' },
  });

  // Taken back — and the trail still leads to it: "which rule let this run?" outlives the rule.
  expect(
    (await callApi(context().user, `/permission-rules/${rule.id}`, { method: 'DELETE' })).status,
  ).toBe(200);

  // The screen, from a link to this session's allowed writes, opened signed out.
  const query = new URLSearchParams({ sessionId, decision: expected.decision }).toString();
  await openSignedIn(page, trail.user, `/audit?${query}`);

  const row = page.getByRole('listitem').filter({ hasText: expected.unasked });
  await expect(row).toHaveCount(1);
  await expect(row.getByText(expected.byRule)).toBeVisible();

  await row.getByRole('button', { name: expected.openRule }).click();
  await page.waitForURL(`**/rules/${rule.id}*`);
  // The validity cell's own sentence for a revoked rule (`rules.row.revokedOn`) carries the date
  // in the middle of it, so this is a substring match, never `exact` — the state it explains is
  // the part that matters here, not the timestamp (B-36, S-222).
  await expect(page.getByText(expected.revokedStatus)).toBeVisible();
});

test(`${fromThePhone.id} — ${fromThePhone.title}`, async () => {
  const expected = fromThePhone.expect as { resolvedFrom: string };
  const { socket: web, sessionId } = await openedSession();
  const mobile = await connectedPhone(context().user, await approvedPhone(context().user));
  await attachFrom(mobile, sessionId, 0);

  try {
    // The browser prompts, and the phone is the one that says "don't ask again anywhere".
    const granting = await writeTurn(web, sessionId, ALLOW_ALWAYS, mobile);
    expect(granting.resolved.map((frame) => frame.payload)).toEqual([
      expect.objectContaining({
        decision: 'allow',
        auto: false,
        resolvedFrom: expected.resolvedFrom,
      }),
    ]);
    await ruleLeftBy(granting);

    // The browser's session asks nobody now — and the phone, still watching, sees the rule act.
    const mark = mobile.frames.length;
    const unasked = await writeTurn(web, sessionId, null);
    expectRanUnasked(unasked);

    const settled = onlyOne(unasked.resolved);
    const onThePhone = await mobile.waitFor(
      (frame) =>
        mobile.frames.indexOf(frame) >= mark &&
        frame.type === 'permission.resolved' &&
        requestIdOf(frame) === requestIdOf(settled),
    );
    expect(onThePhone.payload).toEqual(settled.payload);
    expect(mobile.frames.slice(mark).some((frame) => frame.type === 'permission.requested')).toBe(
      false,
    );
  } finally {
    mobile.close();
    await closeSession(web, sessionId);
  }
});
