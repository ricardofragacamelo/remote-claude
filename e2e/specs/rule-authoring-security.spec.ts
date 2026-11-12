import { expect, test } from '@playwright/test';

import { openSignedIn, signIn } from '../fixtures/auth';
import type { ScenarioUser } from '../scenarios';
import { callApi } from '../fixtures/api';
import { environment } from '../fixtures/environment';
import { workspaceFor } from '../fixtures/live-session';
import { revokingEveryRuleAfterEach, rulesOf, runScriptedTurn } from '../fixtures/rules';
import {
  confirmRuleCreated,
  createRuleThroughWizard,
  pickAnyUseOf,
  pickKind,
  pickRadioThenNext,
  pickValidityToday,
  skipSubjectStep,
} from '../fixtures/wizard';
import { scenario } from '../scenarios';

/**
 * Security the screen must never relax — plan 15, F4 (B-35).
 *
 * A pattern wide enough to be "Permitir tudo" by another name is refused wherever it is asked for,
 * not only where the wizard happens to check it; a folder nobody allowlisted is never even an
 * option to pick; a second person's own rules, test, simulation and export never see the first
 * person's; and a mode that holds nothing back of its own (`readOnly`) still asks, even for a rule
 * the screen itself created moments before.
 *
 * Every case ends by taking back whatever rules this user still holds.
 */

const broad = scenario('rules-authoring-security-broad');
const isolation = scenario('rules-authoring-security-isolation');
const readOnly = scenario('rules-authoring-security-readonly');

const context = workspaceFor(broad.user);

revokingEveryRuleAfterEach(() => context().user);

/** Today's own date — same reasoning as every other F4 spec's own `todayDateInput`: the stack's
 * own validity ceiling is a single day, shorter than every fixed shortcut the screen offers. */
function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

test(`${broad.id} — ${broad.title}`, async ({ page }) => {
  const expected = broad.expect as { kind: string; blockedPattern: string };

  // The wizard: a whole `shell` — "Any use of Shell" — with Allow, never offered a way past it.
  await openSignedIn(page, broad.user, '/rules/new');
  await pickKind(page, expected.kind);
  await pickAnyUseOf(page, expected.kind);
  await pickRadioThenNext(page, 'Allow or block');
  await pickRadioThenNext(page, 'Where it reaches');
  await pickValidityToday(page, todayDateInput());

  const confirm = page.getByRole('button', { name: 'Create the rule' });
  await expect(confirm).toBeDisabled();
  await expect(page.getByText(`is too wide to allow`, { exact: false })).toBeVisible();

  // The same refusal, by the door the wizard itself would otherwise call — a direct `POST`, with
  // nothing in front of it this time.
  const refused = await callApi(context().user, '/permission-rules', {
    method: 'POST',
    body: { pattern: expected.blockedPattern, decision: 'allow', scope: 'always' },
  });
  expect(refused.status).toBe(422);
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
    'PERMISSION_RULE_TOO_BROAD',
  );

  // The folder selector: only the allowlist, never a hint of anything outside it — read straight
  // from the same door the dialog itself calls, so this never drifts from what the allowlist
  // actually holds for this user.
  const allowed = await callApi(context().user, '/workspaces');
  const roots = ((await allowed.json()) as { workspaces: readonly { label: string }[] }).workspaces;

  await page.goto(`${environment.webUrl}/rules/new`);
  await pickKind(page, 'Search');
  await skipSubjectStep(page);
  await pickRadioThenNext(page, 'Allow or block');

  await page
    .getByRole('radiogroup', { name: 'Where it reaches' })
    .getByRole('radio')
    .last()
    .click();
  await page.getByRole('button', { name: 'Choose a folder…' }).click();
  const folderDialog = page.getByRole('dialog', { name: 'Choose a folder' });
  const options = await folderDialog.getByRole('option').all();
  const shown = await Promise.all(options.map((option) => option.textContent()));

  expect(shown.map((text) => text?.trim())).toEqual(roots.map((root) => root.label));
});

test(`${isolation.id} — ${isolation.title}`, async ({ page, browser }) => {
  const expected = isolation.expect as {
    stranger: ScenarioUser;
    kind: string;
    command: string;
    pattern: string;
  };

  // The first person's own rule — created through the test panel then the wizard, the same cycle
  // `rule-authoring.spec.ts` already proves, so the second person has something real to not see.
  await openSignedIn(page, isolation.user, '/rules/new');
  await createRuleThroughWizard(page, {
    kind: expected.kind,
    command: expected.command,
    dateInput: todayDateInput(),
  });

  // The second person, signed in on their own — never the first's own browser context.
  const stranger = await signIn(browser, expected.stranger);

  // The list: none of the first person's rules.
  const strangerRules = await rulesOf(stranger);
  expect(strangerRules.some((rule) => rule.pattern === expected.pattern)).toBe(false);

  // The export: the same, read straight from the door "Exportar" calls.
  const exported = await callApi(stranger, '/permission-rules/export');
  expect(exported.status).toBe(200);
  const exportedRules = ((await exported.json()) as { rules: readonly { pattern: string }[] })
    .rules;
  expect(exportedRules.some((rule) => rule.pattern === expected.pattern)).toBe(false);

  // The test panel and the simulation: the same question the first person's own rule would have
  // answered, asked instead by the second person, who answers it with nothing of their own.
  const preview = await callApi(stranger, '/permission-rules/evaluate', {
    method: 'POST',
    body: { kind: 'shell', subject: { command: expected.command } },
  });
  expect(preview.status).toBe(200);
  expect(((await preview.json()) as { outcome: string }).outcome).toBe('ask');

  const simulated = await callApi(stranger, '/permission-rules/simulate', {
    method: 'POST',
    body: { add: [{ pattern: expected.pattern, decision: 'allow' }], limit: 50 },
  });
  expect(simulated.status).toBe(200);
  const simulation = (await simulated.json()) as {
    changes: readonly { entry: { toolName: string } }[];
  };
  expect(simulation.changes.every((change) => change.entry.toolName !== 'Bash')).toBe(true);
});

test(`${readOnly.id} — ${readOnly.title}`, async ({ page }) => {
  const expected = readOnly.expect as { fixture: string; scope: string };

  // An `allow` rule for `web.fetch`, created through the screen — bare (`broad`, D-09), so it
  // reaches any URL the scripted call below names, acknowledged the same way the review step
  // already asks for any accepted `broad` item.
  await openSignedIn(page, readOnly.user, '/rules/new');
  await pickKind(page, 'Fetch');
  await pickAnyUseOf(page, 'Fetch');
  await pickRadioThenNext(page, 'Allow or block');
  await pickRadioThenNext(page, 'Where it reaches');
  await pickValidityToday(page, todayDateInput());
  await page.getByLabel('I understand this reaches more than one exact case.').check();
  await confirmRuleCreated(page);

  // The same rule, proven first in the ordinary `ask` mode: it answers without a card.
  const ordinary = await runScriptedTurn(context().user, context().workspace, expected.fixture);
  expect(ordinary.turn.asked).toHaveLength(0);

  // The regression: the same rule, a session in `readOnly` this time — `decideOutcome` skips an
  // `allow` there on purpose (B-35), so the card appears all the same.
  const regression = await runScriptedTurn(context().user, context().workspace, expected.fixture, {
    permissionMode: 'readOnly',
    answer: { decision: 'deny', scope: 'once', reason: 'readOnly regression e2e, B-35' },
  });
  expect(regression.turn.asked).toHaveLength(1);
});
