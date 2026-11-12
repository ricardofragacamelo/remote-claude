import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { callApi } from '../fixtures/api';
import { environment } from '../fixtures/environment';
import { workspaceFor } from '../fixtures/live-session';
import { violationsOn, scrollsSideways, widerThanThePage } from '../fixtures/page-checks';
import {
  describedRule,
  revokeQuietly,
  revokingEveryRuleAfterEach,
  rulesOf,
} from '../fixtures/rules';
import type { ListedRule } from '../fixtures/rules';
import {
  pickKind,
  pickRadioThenNext,
  pickValidityToday,
  typeSubjectPrefix,
} from '../fixtures/wizard';
import { scenario } from '../scenarios';

/**
 * Accessibility and the small-screen layout of the rules screens — plan 15, F4 (B-36, S-221) — and
 * the old deep link every trail entry still opens by (S-222).
 *
 * The integration suite already runs axe on every component in jsdom, which has no layout and no
 * colours: contrast, and anything the stylesheet itself decides, only a real browser can judge
 * (the same reasoning `workbench-a11y.spec.ts` already wrote for plan 06's own screens — `/rules`'s
 * own bare list is already swept there, alongside the rest of the global screens; what is new here
 * is the rest of this feature's own states: the detail panel, a dialog open over the list, and
 * every step of the wizard).
 */

const a11y = scenario('rules-a11y');
const expected = a11y.expect as {
  tags: string[];
  phone: { width: number; height: number };
};

const deepLink = scenario('rules-deep-link');

const context = workspaceFor(a11y.user);

revokingEveryRuleAfterEach(() => context().user);

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Dismisses the notification toast, tolerating none at all.
 *
 * This stack's own validity ceiling (`RC_PERMISSION_RULE_MAX_LIFETIME_MS`, a single day) puts
 * every rule this spec ever grants within the seven-day reminder window (B-25) — the toast it
 * raises is incidental to what this spec itself is auditing, and axe caught it once mid fade-in,
 * a transient state neither this spec nor B-25's own coverage is about proving one way or another.
 * One attempt, bounded — never a loop: the close button is itself mid-animation the instant the
 * toast appears, and retrying against it is what actually got stuck waiting, not the toast itself.
 */
async function dismissNotifications(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Dismiss' }).first();
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click({ timeout: 5_000 }).catch(() => undefined);
  }
}

test(`${a11y.id} — ${a11y.title} (axe)`, async ({ page }) => {
  await openSignedIn(page, a11y.user, '/rules?tab=active&sort=grantedAt&order=desc');
  await expect(page.getByRole('heading', { level: 1, name: 'Your rules' })).toBeVisible();
  expect(await violationsOn(page, expected.tags), 'the bare list').toEqual([]);

  // A dialog open over the list — "Templates", the catalog ready-made (plan 15, B-30).
  await page.getByRole('button', { name: 'Templates' }).click();
  const templates = page.getByRole('dialog');
  await expect(templates.getByRole('heading', { name: 'Templates' })).toBeVisible();
  expect(await violationsOn(page, expected.tags), 'the Templates dialog').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(templates).toBeHidden();

  // The detail panel, over the list (B-22).
  const granted = await callApi(context().user, '/permission-rules', {
    method: 'POST',
    body: { pattern: 'shell(echo e2e-a11y-detail)', decision: 'allow', scope: 'always' },
  });
  const rule = (await granted.json()) as ListedRule;
  try {
    await page.goto(`${environment.webUrl}/rules/${rule.id}?tab=active&sort=grantedAt&order=desc`);
    // The desktop panel opens beside the list, not over it — the same pattern renders twice on
    // screen (B-22's own `<aside>`), so the proof of which rule opened is scoped to the panel.
    const detail = page.getByLabel('Details of the rule');
    await expect(detail.getByText(rule.pattern, { exact: true })).toBeVisible();
    await dismissNotifications(page);
    expect(await violationsOn(page, expected.tags), 'the detail panel').toEqual([]);
  } finally {
    await revokeQuietly(context().user, rule.id);
  }

  // The wizard, every step (B-27) — kind, pattern, decision, folder, validity, review.
  await page.goto(`${environment.webUrl}/rules/new`);
  await expect(page.getByRole('heading', { level: 1, name: 'New rule' })).toBeVisible();
  expect(await violationsOn(page, expected.tags), 'the wizard, kind').toEqual([]);

  await pickKind(page, 'Shell');
  expect(await violationsOn(page, expected.tags), 'the wizard, pattern').toEqual([]);

  await typeSubjectPrefix(page, 'Command', 'echo e2e-a11y-wizard');
  expect(await violationsOn(page, expected.tags), 'the wizard, decision').toEqual([]);

  await pickRadioThenNext(page, 'Allow or block');
  expect(await violationsOn(page, expected.tags), 'the wizard, folder').toEqual([]);

  await pickRadioThenNext(page, 'Where it reaches');
  expect(await violationsOn(page, expected.tags), 'the wizard, validity').toEqual([]);

  await pickValidityToday(page, todayDateInput());
  expect(await violationsOn(page, expected.tags), 'the wizard, review').toEqual([]);
});

test(`${a11y.id} — ${a11y.title} (phone)`, async ({ page }) => {
  await page.setViewportSize(expected.phone);
  await openSignedIn(page, a11y.user, '/rules?tab=active&sort=grantedAt&order=desc');
  expect(await scrollsSideways(page), (await widerThanThePage(page)).join('\n')).toBe(false);

  const granted = await callApi(context().user, '/permission-rules', {
    method: 'POST',
    body: { pattern: 'shell(echo e2e-a11y-sheet)', decision: 'allow', scope: 'always' },
  });
  const rule = (await granted.json()) as ListedRule;

  try {
    // The desktop panel is an `<aside>` beside the list; a phone never has room for that — it is a
    // `Sheet` instead (`RuleRoute.tsx`), the same `role="dialog"` a real dialog gets.
    await page.goto(`${environment.webUrl}/rules/${rule.id}?tab=active&sort=grantedAt&order=desc`);
    const sheet = page.getByRole('dialog', { name: 'Rule' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(rule.pattern, { exact: true })).toBeVisible();
    expect(await scrollsSideways(page), (await widerThanThePage(page)).join('\n')).toBe(false);
  } finally {
    await revokeQuietly(context().user, rule.id);
  }
});

test(`${deepLink.id} — ${deepLink.title}`, async ({ page }) => {
  const scope = deepLink.expect['scope'] as string;

  const activeResponse = await callApi(context().user, '/permission-rules', {
    method: 'POST',
    body: { pattern: 'shell(echo e2e-deep-link-active)', decision: 'allow', scope },
  });
  const active = (await activeResponse.json()) as ListedRule;

  const toRevokeResponse = await callApi(context().user, '/permission-rules', {
    method: 'POST',
    body: { pattern: 'shell(echo e2e-deep-link-revoked)', decision: 'allow', scope },
  });
  const toRevoke = (await toRevokeResponse.json()) as ListedRule;
  expect(
    (await callApi(context().user, `/permission-rules/${toRevoke.id}`, { method: 'DELETE' }))
      .status,
  ).toBe(200);

  // The active rule, opened straight from its own old link — the desktop panel opens beside the
  // list, not over it, so the same pattern can render twice on screen; the proof is scoped to the
  // panel itself.
  await openSignedIn(
    page,
    deepLink.user,
    `/rules/${active.id}?tab=active&sort=grantedAt&order=desc`,
  );
  const detail = page.getByLabel('Details of the rule');
  await expect(detail.getByText(active.pattern, { exact: true })).toBeVisible();

  // The revoked one, from the same kind of link — it still opens, and says what it is now.
  await page.goto(
    `${environment.webUrl}/rules/${toRevoke.id}?tab=active&sort=grantedAt&order=desc`,
  );
  await expect(detail.getByText(toRevoke.pattern, { exact: true })).toBeVisible();
  await expect(detail.getByText('It no longer answers anything.')).toBeVisible();

  const described = await describedRule(context().user, toRevoke.id);
  expect(described.status).toBe('revoked');

  expect((await rulesOf(context().user)).some((rule) => rule.id === active.id)).toBe(true);
});
