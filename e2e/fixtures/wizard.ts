import type { Page } from '@playwright/test';

/**
 * The wizard's own six steps (`/rules/new`, plan 15, B-27), as every F4 spec drives them — one
 * call per step, so a spec reads as the draft it is building rather than the clicks that build it.
 *
 * Nothing here asserts anything: a spec that needs to check a step along the way (the review step
 * blocked, say) still reads the screen itself, between two of these calls.
 */

/** Step 1 — picks the kind, by its own radio label, and advances. */
export async function pickKind(page: Page, kindLabel: string): Promise<void> {
  await page.getByRole('radio', { name: kindLabel, exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
}

/** Step 2, a kind with a subject field — a prefix of `value`, typed into `fieldLabel`
 * ("Command", "Path", "Domain"). */
export async function typeSubjectPrefix(
  page: Page,
  fieldLabel: string,
  value: string,
): Promise<void> {
  await page.getByRole('radio', { name: 'This, and anything after it' }).click();
  await page.getByRole('textbox', { name: fieldLabel }).fill(value);
  await page.getByRole('button', { name: 'Next' }).click();
}

/** Step 2, the bare kind — "Any use of {{kind}}", the one D-09 calls `broad` or `unbounded`. */
export async function pickAnyUseOf(page: Page, kindLabel: string): Promise<void> {
  await page.getByRole('radio', { name: `Any use of ${kindLabel}` }).click();
  await page.getByRole('button', { name: 'Next' }).click();
}

/** Step 2, a kind with no subject field at all (`subjectFieldOf` reads `none`) — nothing to pick,
 * Next is already enabled. */
export async function skipSubjectStep(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next' }).click();
}

/** Steps 3 and 4 share this shape: one radiogroup, its first or last option, then Next. */
export async function pickRadioThenNext(
  page: Page,
  groupName: string,
  which: 'first' | 'last' = 'first',
): Promise<void> {
  const option = page.getByRole('radiogroup', { name: groupName }).getByRole('radio');
  await (which === 'first' ? option.first() : option.last()).click();
  await page.getByRole('button', { name: 'Next' }).click();
}

/** Step 5 — the free-date field, never a fixed shortcut: every F4 stack's own validity ceiling is
 * shorter than the shortest one the screen offers (see each spec's own `todayDateInput`). */
export async function pickValidityToday(page: Page, dateInput: string): Promise<void> {
  await page.getByLabel('Or pick a date').fill(dateInput);
  await page.getByRole('button', { name: 'Next' }).click();
}

/** Step 6 — confirms, and waits for the rule's own detail page, never `/rules/new` itself. */
export async function confirmRuleCreated(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Create the rule' }).click();
  await page.waitForURL(
    (url) => /^\/rules\/[^/]+$/.test(url.pathname) && url.pathname !== '/rules/new',
  );
}

/**
 * The whole wizard, start to finish, for the shape every F4 spec needs most often: a `Command`
 * kind's own prefix, Allow, Always, today's date. A spec whose own draft differs composes the
 * steps above instead — this is the one shape common to more than one already.
 */
export async function createRuleThroughWizard(
  page: Page,
  options: { readonly kind: string; readonly command: string; readonly dateInput: string },
): Promise<void> {
  await pickKind(page, options.kind);
  await typeSubjectPrefix(page, 'Command', options.command);
  await pickRadioThenNext(page, 'Allow or block');
  await pickRadioThenNext(page, 'Where it reaches');
  await pickValidityToday(page, options.dateInput);
  await confirmRuleCreated(page);
}
