import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import {
  cardFor,
  mcpIndicatorButton,
  panelOf,
  refuse,
  send,
  turnsEnded,
} from '../fixtures/claude-panel';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { mcpSettingsAddress, writeProjectMcpJson } from '../fixtures/project-mcp';
import { trailOf } from '../fixtures/rules';
import { openFromDraft, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * A project's own `.mcp.json`, and the permission card of an MCP tool — plan 13, F4, B-43.
 *
 * Two things this phase's earlier specs never touched: the servers a project **declares** rather
 * than the ones this user added to the store (B-24, D-11), and the card a call of one of them asks
 * through (B-26). Both reuse the fixture stdio server of D-19
 * (`e2e/fixtures/mcp-server/fixture-mcp-server.mjs`) and the recorded run of plan 26's own parity
 * fixture, `mcp-untitled-tool-turn` — a real `tool_use` of `mcp__fixture__echo`, the CLI's native
 * name, asked about through `canUseTool` exactly as any other tool (S-116).
 *
 * `.mcp.json` is written straight to disk rather than through the editor of plan 07: this stack runs
 * on this machine, and the backend climbs from a real folder for a real file, the way the CLI itself
 * does (docs/discovery/01-descoberta-claude-agent-sdk.md). The server it names is genuinely spawnable
 * — the same script and the same command B-42 already proved live — because the live status this
 * screen shows (D-10) probes it for real, independently of the scripted SDK behind the conversation.
 */

const project = scenario('claude-settings-project-mcp');
const expected = project.expect as {
  serverName: string;
  toolLabel: string;
  nativeToolName: string;
};

test.use({ viewport: { width: 1920, height: 1080 } });

const suite = workbenchSuite(project.user);
const opened = sessionsOpened(suite.user);

/** The group a folder's own `.mcp.json` entries are listed in (B-24, B-28). */
function projectGroup(page: Page): Locator {
  return page.getByRole('region', { name: "The project's own MCP file" });
}

/** The row of one entry of that group, by the server's own name. */
function projectEntryRow(page: Page, name: string): Locator {
  return projectGroup(page).getByRole('listitem').filter({ hasText: name });
}

/** The command line D-19's own fixture server runs under, naming itself [expected.serverName]. */
const SERVER_ARGS = [
  'e2e/fixtures/mcp-server/fixture-mcp-server.mjs',
  '--name',
  expected.serverName,
] as const;

test(`${project.id} — a project's own .mcp.json: pending → approved → a session has it; changed → the next one does not (S-190)`, async ({
  page,
  browser,
}) => {
  const tree = suite.tree();
  writeProjectMcpJson(tree.alpha, expected.serverName, SERVER_ARGS);

  let approvedWatch: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let changedWatch: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    await openSignedIn(page, project.user, mcpSettingsAddress(tree.alpha));
    const row = projectEntryRow(page, expected.serverName);
    await expect(row.getByText('Pending', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(row.getByText('Approved', { exact: true })).toBeVisible();

    // A session opened in this folder, after the approval, gets the server (S-100).
    approvedWatch = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const approvedPage = await approvedWatch.newPage();
    await openSignedIn(approvedPage, project.user, workbenchAddress(tree.alpha));
    opened(await openFromDraft(approvedPage));
    await expect(mcpIndicatorButton(approvedPage, 1, 1)).toBeVisible();

    // The file changes afterwards: narrower args, so the entry's digest no longer matches what was
    // approved (D-11) — the screen says "changed since approved" rather than silently "approved".
    writeProjectMcpJson(tree.alpha, expected.serverName, [...SERVER_ARGS, 'renamed']);
    await page.reload();
    await expect(row.getByText('Changed since approved', { exact: true })).toBeVisible();

    // A session opened next, in the same folder, does not get what changed (S-103): composing a
    // session's own servers re-reads the file and drops an approval whose digest no longer matches.
    changedWatch = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const changedPage = await changedWatch.newPage();
    await openSignedIn(changedPage, project.user, workbenchAddress(tree.alpha));
    opened(await openFromDraft(changedPage));
    await expect(mcpIndicatorButton(changedPage)).toHaveCount(0);
  } finally {
    await approvedWatch?.close();
    await changedWatch?.close();
  }
});

test(`${project.id} — a call of an MCP tool asks by its kind, with the backend's own label and risk, never the native name; a refusal keeps it from running (S-191)`, async ({
  page,
}) => {
  const tree = suite.tree();
  await openSignedIn(page, project.user, workbenchAddress(tree.gamma));
  const sessionId = await openFromDraft(page);
  opened(sessionId);

  await send(page, `call the fixture MCP server's echo tool [fixture:mcp-untitled-tool-turn]`);

  const card = cardFor(page, expected.toolLabel);
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading')).toHaveText('Use an MCP tool');
  await expect(card.getByText('Could destroy something', { exact: true })).toBeVisible();
  // The native name the CLI gave the call never reaches the screen — only the kind, and the label
  // the backend composed from the server and the tool (plan 13, B-26; S-116).
  await expect(page.getByText(expected.nativeToolName)).toHaveCount(0);

  await refuse(card).click();

  // The card becomes the line its decision settled on — "Refused by you" — the moment
  // `permission.resolved` says so, never waiting on (or contradicted by) what a dumb replay's own
  // scripted `tool_result` says next: that line is what proves the refusal reached the engine, not
  // a status the scripted fixture cannot make honest either way.
  await expect(panelOf(page).getByText('Refused by you', { exact: true })).toBeVisible();
  // The turn still ends — the refusal is answered, not a hang.
  await expect(turnsEnded(page, 2)).toBeVisible();

  // The trail has both: the hook's own record of the call, before any vote, and the decision
  // written beside it once the refusal reached the engine (plan 03, S-65) — written asynchronously,
  // off the event that releases the loop, so it is polled rather than read once.
  await expect
    .poll(async () =>
      (await trailOf(suite.user(), sessionId))
        .filter((entry) => entry.toolName === expected.nativeToolName)
        .map((entry) => entry.decision)
        .sort(),
    )
    .toEqual(['denied', 'recorded']);
});
