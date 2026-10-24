import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { openSignedIn } from '../fixtures/auth';
import { mcpIndicatorButton } from '../fixtures/claude-panel';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { openFromDraft, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The cycle of an MCP server, through the door a person uses — plan 13, F4, B-42.
 *
 * A fixture stdio server ([D-19](../../docs/plans/13-claude-settings/decisions.md#d-19--servidor-mcp-de-fixture))
 * with a secret in an environment variable, added through the wizard's own second step (S-187):
 * the trail records it (`mcp.serverAdded`, read from `/audit-events` directly — plan 14 does not
 * exist yet), and the secret's value never comes back — not in the body of the write, not on the
 * screen, and not after a reload (S-188). A live session opened once the server is in the store
 * shows it connected; turning it off from the screen reaches that same session right away, without
 * it being reopened (D-10's "tighten applies now"), and its own indicator says so (S-189).
 *
 * The Agent SDK behind the stack is the scripted replay every end-to-end spec shares
 * (`RC_E2E_FIXTURE`): only the Claude CLI's `query()` is replaced, never the MCP adapter, so the
 * composition this spec exercises — the store, `setMcpServers()`, `toggleMcpServer()` and the
 * `session.mcpStatusChanged` push — is the product's own code, not a fake of it. What is scripted is
 * only the server's own `connected` result, which is why this never spawns the fixture's real
 * process: the command and arguments this test gives the server are the real ones the recorder and
 * `smoke-live` use (`node e2e/fixtures/mcp-server/fixture-mcp-server.mjs --secret-variable …`), but
 * they are never actually run here.
 */

const mcp = scenario('claude-settings-mcp');
const expected = mcp.expect as {
  serverName: string;
  secretName: string;
  secretValue: string;
};

test.use({ viewport: { width: 1920, height: 1080 } });

const suite = workbenchSuite(mcp.user);
const opened = sessionsOpened(suite.user);

/** The address of the MCP servers section of the agent settings, for Claude, in one folder. */
function mcpSettingsAddress(folder: string): string {
  return `/settings/agents/claude?${new URLSearchParams({ section: 'mcp', folder }).toString()}`;
}

/** The server this spec added, from the store's own list — `undefined` once removed. */
async function storedServer(): Promise<{ id: string; name: string } | undefined> {
  const response = await callApi(suite.user(), '/engines/claude/mcp-servers');
  expect(response.status).toBe(200);
  const body = (await response.json()) as { servers: readonly { id: string; name: string }[] };
  return body.servers.find((server) => server.name === expected.serverName);
}

/** Leaves no server of this spec's own behind, whether or not the test reached its end cleanly. */
async function removeStoredServer(): Promise<void> {
  const server = await storedServer();
  if (server !== undefined) {
    const response = await callApi(suite.user(), `/engines/claude/mcp-servers/${server.id}`, {
      method: 'DELETE',
    });
    expect([204, 404]).toContain(response.status);
  }
}

/** Opens the "Add server" wizard and fills its first step with a stdio server carrying a secret. */
async function fillServerForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add server', exact: true }).click();
  const dialog = page.getByRole('dialog');

  await dialog.getByLabel('Name', { exact: true }).fill(expected.serverName);
  await dialog.getByLabel('Command', { exact: true }).fill('node');
  await dialog
    .getByLabel('Arguments, one per line', { exact: true })
    .fill(
      `e2e/fixtures/mcp-server/fixture-mcp-server.mjs\n--secret-variable\n${expected.secretName}`,
    );
  await dialog.getByRole('button', { name: 'Add a variable' }).click();
  await dialog.getByLabel('Variable name', { exact: true }).fill(expected.secretName);
  await dialog.getByLabel('Variable value', { exact: true }).fill(expected.secretValue);
}

/** The dialog open on the server this spec added, its secret shown only as "set" (S-188). */
async function expectSecretNeverShown(page: Page): Promise<void> {
  const row = page.locator('tr').filter({ hasText: expected.serverName });
  await row.dblclick();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Edit server' })).toBeVisible();
  await expect(dialog.getByText('Set', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Variable name', { exact: true })).toHaveValue(
    expected.secretName,
  );
  await expect(page.getByText(expected.secretValue)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
}

test(`${mcp.id} — ${mcp.title}`, async ({ page, browser }) => {
  const tree = suite.tree();
  // Defensive: a previous run interrupted mid-test would otherwise collide on the server's name.
  await removeStoredServer();

  let watching: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    await openSignedIn(page, mcp.user, mcpSettingsAddress(tree.alpha));
    await fillServerForm(page);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();

    // The confirmed write, over the network: the secret's value is never in the body (S-188).
    const [created] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/engines/claude/mcp-servers') &&
          response.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: 'Confirm', exact: true }).click(),
    ]);
    expect(created.status()).toBe(201);
    expect(await created.text()).not.toContain(expected.secretValue);

    // On the trail, read directly — plan 14's timeline does not exist yet (S-187).
    const auditResponse = await callApi(
      suite.user(),
      `/audit-events?${new URLSearchParams({ kind: 'mcp.serverAdded' }).toString()}`,
    );
    expect(auditResponse.status).toBe(200);
    const auditBody = await auditResponse.text();
    expect(auditBody).not.toContain(expected.secretValue);
    const audit = JSON.parse(auditBody) as {
      events: readonly { subjectLabel: string; details: { params?: { envNames?: string } } }[];
    };
    const added = audit.events.find((event) => event.subjectLabel === expected.serverName);
    expect(added?.details.params?.envNames).toBe(expected.secretName);

    // On the screen, right after adding, and once more after a reload (S-188).
    await expect(page.getByText(expected.serverName, { exact: true })).toBeVisible();
    await expectSecretNeverShown(page);
    await page.reload();
    await expect(page.getByText(expected.serverName, { exact: true })).toBeVisible();
    await expectSecretNeverShown(page);

    // A session opened once the server is in the store shows it connected (S-189).
    watching = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const liveSession = await watching.newPage();
    await openSignedIn(liveSession, mcp.user, workbenchAddress(tree.alpha));
    const sessionId = await openFromDraft(liveSession);
    opened(sessionId);

    await expect(mcpIndicatorButton(liveSession, 1, 1)).toBeVisible();

    // Turning it off from the screen reaches that live session right away (D-10) — its own
    // indicator changes with no reload and no reopening (S-189).
    await page.getByLabel(`Select ${expected.serverName}`, { exact: true }).check();
    await page.getByRole('button', { name: 'Turn off', exact: true }).click();

    await expect(mcpIndicatorButton(liveSession, 0, 1)).toBeVisible();
  } finally {
    await watching?.close();
    await removeStoredServer();
  }
});
