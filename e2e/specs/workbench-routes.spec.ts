import { expect, test } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';

import { openSignedIn } from '../fixtures/auth';
import { environment } from '../fixtures/environment';
import {
  closeSession,
  connected,
  permissionAsked,
  prompt,
  startSession,
  workspaceFor,
} from '../fixtures/live-session';
import { offeredPattern, revokeQuietly, ruleGrantedFor } from '../fixtures/rules';
import type { ListedRule } from '../fixtures/rules';
import { scenario } from '../scenarios';

/**
 * The addresses of the app after plan 06, through the door a person uses — F6, B-39 (S-163).
 *
 * The screens that kept an address open on it, deep link and all: the trail filtered by its search,
 * one rule by its id. The ones D-07 removed — a session, the history — fall on the "not found" of the
 * app, translated, and never on a blank page or on a screen that happens to match.
 */

const routes = scenario('workbench-routes');
const expected = routes.expect as {
  removed: string[];
  notFound: { en: string; 'pt-BR': string };
};

const context = workspaceFor(routes.user);

test(`${routes.id} — ${routes.title}: the screens that stay`, async ({ page }) => {
  const socket = await connected(context().user);
  const sessionId = await startSession(socket, context().workspace);
  let rule: ListedRule | undefined;

  try {
    // A rule of this test's own, from the question a turn asks.
    prompt(socket, sessionId, 'tool-turn');
    const request = await permissionAsked(socket);
    const pattern = offeredPattern(request, 'project');
    const { requestId } = request.payload as { requestId: string };
    socket.respond(request, { requestId, decision: 'allow', scope: 'project' });
    await socket.waitFor(
      (frame: Envelope) =>
        frame.type === 'permission.resolved' &&
        (frame.payload as { requestId?: string }).requestId === requestId,
    );
    rule = await ruleGrantedFor(context().user, pattern);

    await openSignedIn(page, routes.user, `/rules/${rule.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'A rule you granted' })).toBeVisible();
    await expect(page.getByText(pattern, { exact: true })).toBeVisible();

    const filtered = new URLSearchParams({ sessionId, toolName: 'Write' }).toString();
    await page.goto(`/audit?${filtered}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'What ran on your machine' }),
    ).toBeVisible();
    const filters = page.getByRole('form', { name: 'Filter the trail' });
    await expect(filters.getByLabel('Session')).toHaveValue(sessionId);
    await expect(filters.getByLabel('Tool')).toHaveValue('Write');
  } finally {
    if (rule !== undefined) {
      await revokeQuietly(context().user, rule.id);
    }
    await closeSession(socket, sessionId);
  }
});

test(`${routes.id} — ${routes.title}: the removed ones`, async ({ page, browser }) => {
  await openSignedIn(page, routes.user, '/rules');

  for (const address of expected.removed) {
    await page.goto(address);
    await expect(page.getByRole('heading', { level: 1, name: expected.notFound.en })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the start' })).toBeVisible();
  }

  // In the other language of the app, by the browser's own preference.
  const portuguese = await browser.newContext({ locale: 'pt-BR' });
  try {
    const other = await portuguese.newPage();
    await other.goto(`${environment.webUrl}${expected.removed[0] ?? '/history'}`);
    await expect(
      other.getByRole('heading', { level: 1, name: expected.notFound['pt-BR'] }),
    ).toBeVisible();
  } finally {
    await portuguese.close();
  }
});
