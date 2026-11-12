import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import type { AuthenticatedUser } from '../fixtures/auth';
import { callApi } from '../fixtures/api';
import { environment } from '../fixtures/environment';
import { closeSession, connected, startSession, workspaceFor } from '../fixtures/live-session';
import {
  describedRule,
  expectRanUnasked,
  offeredPattern,
  onlyOne,
  revokeQuietly,
  revokingEveryRuleAfterEach,
  ruleGrantedFor,
  ruleHistoryOf,
  rulesOf,
  writeTurn,
} from '../fixtures/rules';
import type { Answer, ListedRule } from '../fixtures/rules';
import { scenario } from '../scenarios';

/**
 * Managing a rule already granted — plan 15, F4 (B-34).
 *
 * Shortening and extending its validity, revoking a batch of them while a live session is still
 * open on one, and importing a file that names a folder this installation only has under a
 * different path. Every case ends by taking back whatever rules this user still holds.
 */

const expiry = scenario('rules-management-expiry');
const batch = scenario('rules-management-batch');
const importing = scenario('rules-management-import');

const context = workspaceFor(expiry.user);

revokingEveryRuleAfterEach(() => context().user);

/** "Don't ask again anywhere" — the answer that leaves an `always` rule standing. */
const ALLOW_ALWAYS: Answer = { decision: 'allow', scope: 'always' };

/** Today's own date — same reasoning as `rule-authoring.spec.ts`'s own `todayDateInput`: the
 * stack's own `RC_PERMISSION_RULE_MAX_LIFETIME_MS` ceiling is a single day, shorter than every
 * fixed shortcut the screen offers, so the free-date field is the only value every case here can
 * safely pick, whatever the wall clock says when the suite runs. */
function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Grants a rule directly, the door every spec but the wizard's own uses for one it does not need
 * to prove the wizard itself created (`trail-isolation.spec.ts`'s own precedent). */
async function grant(
  user: AuthenticatedUser,
  body: {
    readonly pattern: string;
    readonly decision: 'allow' | 'deny';
    readonly scope: string;
    readonly expiresAt?: string;
    readonly projectPath?: string;
  },
): Promise<ListedRule> {
  const response = await callApi(user, '/permission-rules', { method: 'POST', body });
  expect(response.status).toBe(201);
  return (await response.json()) as ListedRule;
}

async function selectRow(page: Page, pattern: string): Promise<void> {
  await page.getByRole('checkbox', { name: `Select the rule ${pattern}` }).click();
}

test(`${expiry.id} — ${expiry.title}`, async ({ page }) => {
  const now = Date.now();

  // Room to shorten: granted close to the ceiling (24h), so "today" (the free date's own, always
  // end-of-day) reads as sooner than this, whatever the wall clock says when the suite runs.
  const shortenMe = await grant(context().user, {
    pattern: 'shell(echo e2e-shorten-test)',
    decision: 'allow',
    scope: expiry.expect['scope'] as string,
    expiresAt: new Date(now + 23 * 3_600_000).toISOString(),
  });

  // Room to extend: granted a few minutes out, so "today" reads as later than this.
  const extendMe = await grant(context().user, {
    pattern: 'shell(echo e2e-extend-test)',
    decision: 'allow',
    scope: expiry.expect['scope'] as string,
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
  });

  // Shorten — direct, with undo.
  // `/rules/$ruleId` shares `/rules`'s own `validateSearch` (`readRulesSearch`), so it redirects
  // to the same default search the moment it loads (B-21) — the exact destination `openSignedIn`'s
  // own `waitForURL` has to match.
  await openSignedIn(
    page,
    expiry.user,
    `/rules/${shortenMe.id}?tab=active&sort=grantedAt&order=desc`,
  );
  await page.getByRole('button', { name: 'Shorten the validity' }).click();
  await page.getByLabel('Or pick a date').fill(todayDateInput());
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Shortened.')).toBeVisible();

  const shortened = await describedRule(context().user, shortenMe.id);
  expect(new Date(shortened.expiresAt).getTime()).toBeLessThan(
    new Date(shortenMe.expiresAt).getTime(),
  );

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => (await describedRule(context().user, shortenMe.id)).expiresAt)
    .toBe(shortenMe.expiresAt);

  // Extend — a second step, the sentence restated, confirmed only then. Already signed in from
  // the shorten step above, on the same page — a second `openSignedIn` would wait forever for a
  // "Sign in" button a session already past it never shows again.
  await page.goto(
    `${environment.webUrl}/rules/${extendMe.id}?tab=active&sort=grantedAt&order=desc`,
  );
  await page.waitForURL(`**/rules/${extendMe.id}?tab=active&sort=grantedAt&order=desc`);
  await page.getByRole('button', { name: 'Extend the validity' }).click();
  await page.getByLabel('Or pick a date').fill(todayDateInput());
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Extended.')).toBeVisible();

  const extended = await describedRule(context().user, extendMe.id);
  expect(new Date(extended.expiresAt).getTime()).toBeGreaterThan(
    new Date(extendMe.expiresAt).getTime(),
  );

  // The rule's own history — not `/audit` (which only ever lists tool invocations, `GET
  // /audit-entries`, never a rule-management event): both validity changes show there, one per
  // rule (undoing the shorten writes a *second* `permission.ruleExpiryChanged` of its own).
  const shortenHistory = await ruleHistoryOf(context().user, shortenMe.id);
  expect(
    shortenHistory.filter((event) => event.kind === 'permission.ruleExpiryChanged').length,
  ).toBeGreaterThanOrEqual(2);

  const extendHistory = await ruleHistoryOf(context().user, extendMe.id);
  expect(extendHistory.some((event) => event.kind === 'permission.ruleExpiryChanged')).toBe(true);
});

test(`${batch.id} — ${batch.title}`, async ({ page }) => {
  const scope = batch.expect['scope'] as string;

  // Undo, on its own throwaway rule, first — the toast's own action, clicked while it is the
  // only one on screen: sonner keeps more than one stacked, and in a headless page (never
  // focused the way a person's browser is) an earlier toast never auto-dismisses on its own
  // timer, which would otherwise sit in front of this one and eat the click.
  const throwaway = await grant(context().user, {
    pattern: 'shell(echo e2e-batch-undo)',
    decision: 'allow',
    scope,
  });

  await openSignedIn(page, batch.user, '/rules?tab=active&sort=grantedAt&order=desc');
  await selectRow(page, throwaway.pattern);
  await page
    .getByRole('status')
    .filter({ hasText: '1 selected' })
    .getByRole('button', { name: 'Revoke' })
    .click();
  await page.getByRole('button', { name: 'Revoke them' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();

  // Restoring mints a *fresh* rule row — a new `permission.ruleGranted`, with `restoredFrom`
  // pointing at the one just revoked, never the same id reactivated in place (D-01). The original
  // id stays `revoked` forever (`rulesOf` excludes it once it is); it is the pattern that finds
  // the rule standing now.
  await expect
    .poll(async () =>
      (await rulesOf(context().user)).some((rule) => rule.pattern === throwaway.pattern),
    )
    .toBe(true);
  const restored = (await rulesOf(context().user)).find(
    (rule) => rule.pattern === throwaway.pattern,
  )!;
  expect(restored).toMatchObject({ status: 'active' });
  expect(restored.id).not.toBe(throwaway.id);
  const restoredHistory = await ruleHistoryOf(context().user, restored.id);
  expect(restoredHistory.some((event) => event.kind === 'permission.ruleGranted')).toBe(true);

  const socket = await connected(context().user);
  const sessionId = await startSession(socket, context().workspace);

  try {
    // The live rule: left standing by a person answering, the same way `rule-cycle.spec.ts`'s own
    // `ruleLeftBy` discovers it — never a pattern guessed ahead of what the question itself offers.
    const granting = await writeTurn(socket, sessionId, ALLOW_ALWAYS);
    const live = await ruleGrantedFor(
      context().user,
      offeredPattern(onlyOne(granting.asked), scope as 'always'),
    );
    expectRanUnasked(await writeTurn(socket, sessionId, null));

    const second = await grant(context().user, {
      pattern: 'shell(echo e2e-batch-second)',
      decision: 'allow',
      scope,
    });
    const third = await grant(context().user, {
      pattern: 'shell(echo e2e-batch-third)',
      decision: 'allow',
      scope,
    });

    // Back to Active — the throwaway rule above left the screen on it already, but a fresh look
    // at the list is what actually picks up the three just granted above.
    await page.goto(`${environment.webUrl}/rules?tab=active&sort=grantedAt&order=desc`);
    await selectRow(page, live.pattern);
    await selectRow(page, second.pattern);
    await selectRow(page, third.pattern);

    const batchBar = page.getByRole('status').filter({ hasText: '3 selected' });
    await expect(batchBar).toBeVisible();
    await batchBar.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke them' }).click();
    await expect(page.getByText('Revoked 3.')).toBeVisible();

    // The still-open live session: nobody's rule answers for it any more.
    const asked = await writeTurn(socket, sessionId, {
      decision: 'deny',
      scope: 'once',
      reason: 'asked again after the batch revocation',
    });
    expect(asked.asked).toHaveLength(1);

    // The Revoked tab — all three, from the screen that just took them back.
    await page.getByRole('tab', { name: /Revoked/ }).click();
    await expect(page.getByText(live.pattern)).toBeVisible();
    await expect(page.getByText(second.pattern)).toBeVisible();
    await expect(page.getByText(third.pattern)).toBeVisible();

    const historyOfLive = await ruleHistoryOf(context().user, live.id);
    expect(historyOfLive.some((event) => event.kind === 'permission.ruleRevoked')).toBe(true);
  } finally {
    await closeSession(socket, sessionId);
  }
});

test(`${importing.id} — ${importing.title}`, async ({ page }) => {
  const unknownFolder = importing.expect['unknownFolder'] as string;
  const pattern = 'shell(echo e2e-import-test)';
  const file = JSON.stringify({
    format: 'remote-claude.permission-rules',
    version: 1,
    exportedAt: new Date().toISOString(),
    rules: [
      {
        pattern,
        decision: 'allow',
        scope: importing.expect['scope'],
        projectPath: unknownFolder,
      },
    ],
  });

  await openSignedIn(page, importing.user, '/rules?tab=active&sort=grantedAt&order=desc');

  await page.getByRole('button', { name: 'Import' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Choose a file…')
    .setInputFiles({ name: 'rules.json', mimeType: 'application/json', buffer: Buffer.from(file) });

  const remapButton = dialog.getByRole('button', {
    name: `Choose a folder for “${unknownFolder}”…`,
  });
  await expect(remapButton).toBeVisible();
  await remapButton.click();

  const folderDialog = page.getByRole('dialog', { name: 'Choose a folder' });
  await folderDialog.getByRole('option').first().click();
  await folderDialog.getByRole('button', { name: 'Choose a folder…' }).click();
  await expect(remapButton).toBeHidden();

  await dialog.getByLabel('Or pick a date').fill(todayDateInput());

  const confirm = dialog.getByRole('button', { name: 'Apply' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();

  const created = (await rulesOf(context().user)).find((rule) => rule.pattern === pattern);
  expect(created, `no rule with the pattern ${pattern} was created by the import`).toBeDefined();
  expect(created).toMatchObject({ scope: importing.expect['scope'], status: 'active' });

  if (created !== undefined) {
    await revokeQuietly(context().user, created.id);
  }
});
