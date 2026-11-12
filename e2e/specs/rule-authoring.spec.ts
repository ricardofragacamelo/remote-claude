import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { environment } from '../fixtures/environment';
import { closeSession, connected, startSession, workspaceFor } from '../fixtures/live-session';
import {
  describedRule,
  expectAllowedUnasked,
  expectDeniedUnasked,
  invocationsOf,
  revokingEveryRuleAfterEach,
  ruleGrantedFor,
  trailOf,
  writeTurn,
} from '../fixtures/rules';
import { scenario } from '../scenarios';

/**
 * The cycle of a rule **born on the screen** — plan 15, F4 (B-33).
 *
 * Plan 03's own `rule-cycle.spec.ts` proves the cycle starting from a question a tool call raised;
 * this one starts from the wizard instead, and the rest has to agree all the same: the test panel
 * calls it right before and after, a scripted session's next matching call is settled without a
 * card, the usage and the invocations move, and the trail names the rule.
 *
 * Every case ends by taking back whatever rules this user still holds — a rule that outlived a
 * failed case would answer a later spec's own write on the same stack.
 */

const authoring = scenario('rules-authoring-test');
const network = scenario('rules-authoring-network');

const context = workspaceFor(authoring.user);

revokingEveryRuleAfterEach(() => context().user);

/**
 * Today's own date, for the validity step's free-date field — the stack's own
 * `RC_PERMISSION_RULE_MAX_LIFETIME_MS` (`scripts/lib/stack.mjs`) is a single day, shorter than
 * every fixed shortcut the screen offers (7 days, the shortest); today's date always resolves to
 * the **end** of today (`dateInputToExpiresAt`), which is still ahead of "now" whatever the clock
 * says, and never past the ceiling.
 */
function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

test(`${authoring.id} — ${authoring.title}`, async ({ page }) => {
  const expected = authoring.expect as {
    kind: string;
    command: string;
    pattern: string;
    askSuffix: string;
    allowedPrefix: string;
    fixture: string;
    scope: string;
  };

  await openSignedIn(page, authoring.user, '/rules/test');

  await page.getByRole('radio', { name: expected.kind }).click();
  await page.getByRole('textbox', { name: 'Command' }).fill(expected.command);
  await expect(page.getByRole('status').filter({ hasText: expected.askSuffix })).toBeVisible();

  // The wizard, from scratch: kind, the prefix pattern, allow, always, a week, confirm.
  await page.goto(`${environment.webUrl}/rules/new`);
  await page.getByRole('radio', { name: expected.kind }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radio', { name: 'This, and anything after it' }).click();
  await page.getByRole('textbox', { name: 'Command' }).fill(expected.command);
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('radiogroup', { name: 'Allow or block' }).getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page
    .getByRole('radiogroup', { name: 'Where it reaches' })
    .getByRole('radio')
    .first()
    .click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Or pick a date').fill(todayDateInput());
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Create the rule' }).click();
  await page.waitForURL(
    (url) => /^\/rules\/[^/]+$/.test(url.pathname) && url.pathname !== '/rules/new',
  );

  const rule = await ruleGrantedFor(context().user, expected.pattern);
  expect(rule).toMatchObject({
    scope: expected.scope,
    status: 'active',
    decision: 'allow',
    grantedBy: context().user.userId,
  });

  // The same test panel, asked again — now a rule answers it.
  await page.goto(`${environment.webUrl}/rules/test`);
  await page.getByRole('radio', { name: expected.kind }).click();
  await page.getByRole('textbox', { name: 'Command' }).fill(expected.command);
  await expect(page.getByRole('status').filter({ hasText: expected.allowedPrefix })).toBeVisible();

  // A scripted session, on the neutral test engine — the only one with this call recorded —
  // proves the rule for a *different* command its own prefix still reaches.
  const socket = await connected(context().user);
  const sessionId = await startSession(socket, context().workspace, 'test');

  try {
    const turn = await writeTurn(socket, sessionId, null, socket, expected.fixture);
    expectAllowedUnasked(turn);

    const described = await describedRule(context().user, rule.id);
    expect(described.usage.count).toBe(1);

    const invocations = await invocationsOf(context().user, rule.id);
    expect(invocations.length).toBeGreaterThan(0);

    const trail = await trailOf(context().user, sessionId);
    const decided = trail.find(
      (entry) => entry.toolName === 'run_shell' && entry.verdict?.auto === true,
    );
    expect(decided).toMatchObject({
      verdict: { auto: true, ruleId: rule.id, scope: expected.scope },
    });
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${network.id} — ${network.title}`, async ({ page }) => {
  const expected = network.expect as { templateName: string; fixture: string; scope: string };

  // `/rules` redirects to its own default search the moment it loads (B-21) — the exact
  // destination `openSignedIn`'s own `waitForURL` has to match.
  await openSignedIn(page, network.user, '/rules?tab=active&sort=grantedAt&order=desc');

  await page.getByRole('button', { name: 'Templates' }).click();
  const dialog = page.getByRole('dialog');
  const card = dialog.getByRole('listitem').filter({ hasText: expected.templateName });
  await card.getByRole('button', { name: 'Choose' }).click();

  await dialog.getByRole('button', { name: 'In every project' }).click();
  await dialog.getByLabel('Or pick a date').fill(todayDateInput());
  await dialog.getByLabel('I understand some of these reach more than one exact case.').check();

  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toBeHidden();

  const socket = await connected(context().user);
  const sessionId = await startSession(socket, context().workspace, 'test');

  try {
    const turn = await writeTurn(socket, sessionId, null, socket, expected.fixture);
    expectDeniedUnasked(turn);
  } finally {
    await closeSession(socket, sessionId);
  }
});
