import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import {
  allowOnce,
  cardFor,
  messagesOn,
  panelOf,
  reloaded,
  send,
  toolRow,
  turnsEnded,
} from '../fixtures/claude-panel';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { sessionInFolder } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The plan proven through the user's door — plan 27, F8, B-25 (S-103).
 *
 * Everything the backend corrects once (F3…F5) has to actually land on the screen: a `/compact`
 * with no ghost "You" bubble and its summary behind a fold, a failed hook's own warning, an MCP
 * tool's image in its card with its `resource_link` as plain text, a tool a rule denied with its
 * reason, and the generic line of a variant this build has never seen — live, and the same again
 * once the conversation is reopened from its history (never a second recording: a reload reads the
 * same session back).
 */

const rendered = scenario('conversation-losses');
const expected = rendered.expect as {
  compactSummarySnippet: string;
  hookFailureSnippet: string;
  mcpToolLabel: string;
  deniedReasonSnippet: string;
  unknownLineSnippet: string;
};

const suite = workbenchSuite(rendered.user);
const opened = sessionsOpened(suite.user);

/** Expands a collapsed row — a notice, a tool or the compaction line — unless it already is. */
async function opens(row: Locator): Promise<void> {
  if ((await row.getAttribute('aria-expanded')) !== 'true') {
    await row.click();
  }
}

/**
 * `recordedTurn` (`claude-panel.ts`) with the exact turn count it waits for exposed, instead of
 * always "one more than before" — `compact-turn` answers in two (the prompt's own reply, then the
 * compaction that follows it in the same recording), which that helper cannot express.
 */
async function recordedTurns(
  page: Page,
  fixture: string,
  turnsAfter: number,
  allow: readonly string[] = [],
): Promise<void> {
  await send(page, `do the work [fixture:${fixture}]`);
  for (const toolName of allow) {
    await allowOnce(cardFor(page, toolName)).click();
  }
  await expect(turnsEnded(page, turnsAfter)).toBeVisible();
}

/** Everything this suite checks, on whatever screen the conversation is drawn on — live or
 * reopened from the history, since both read the same timeline through the same components. */
async function expectTheConversation(page: Page): Promise<void> {
  const panel = panelOf(page);

  // No ghost "You" bubble for the compaction's own synthetic summary (B-21): its text is never one
  // of the message bubbles the conversation shows.
  for (const bubble of await messagesOn(page).all()) {
    await expect(bubble).not.toContainText(expected.compactSummarySnippet);
  }

  // The compaction row, folded with its summary behind "See summary" (B-18, B-21).
  const compacted = panel.getByRole('separator', { name: 'The conversation was compacted' });
  await expect(compacted).toBeVisible();
  await opens(compacted.getByRole('button'));
  await expect(compacted).toContainText(expected.compactSummarySnippet);

  // The compaction's own command echo, as a `command.output` notice (B-09, B-11).
  await expect(panel.getByRole('button', { name: 'Command output' })).toBeVisible();

  // A failed hook's own warning — folded under the generic title every `agent.info` notice shares
  // (D-10); the harmless hook of the same recording shares the title, so the body is what tells
  // them apart.
  const agentNotices = panel.getByRole('button', { name: 'A message from the agent' });
  await expect(agentNotices).toHaveCount(2);
  await opens(agentNotices.last());
  await expect(panel).toContainText(expected.hookFailureSnippet);

  // The MCP tool's own image, in its card, and its `resource_link` flattened to plain text
  // alongside it (F4 · B-14) — never a clickable link.
  const mcpTool = toolRow(page, expected.mcpToolLabel);
  await opens(mcpTool);
  await expect(panel.getByRole('button', { name: /Open the image/ })).toBeVisible();
  await expect(panel).toContainText('linked.txt');

  // A tool a project's own rule denied, with the reason it was denied (B-10). The model gave this
  // call a title ("Create an empty file"), so the row reads `Shell · <title> (Shell: <command>)`.
  const denied = toolRow(
    page,
    /Shell · Create an empty file \(Shell: touch forbidden\.txt\)/,
    'Refused',
  );
  await opens(denied);
  await expect(panel).toContainText(expected.deniedReasonSnippet);

  // A variant this build has never seen draws the one generic line, instead of vanishing (B-13,
  // B-20) — and the turn after it still completed normally.
  const unknown = panel.getByRole('button', { name: /system:nunca_visto/ });
  await expect(unknown).toBeVisible();
  await opens(unknown);
  await expect(panel).toContainText(expected.unknownLineSnippet);
}

test(`${rendered.id} — the plan proven through the screen, live and from the history`, async ({
  page,
}) => {
  // Five sequential turns, two full renders of the conversation (live, then reopened from the
  // history) — more steps than the default timeout budgets for.
  test.setTimeout(300_000);

  await sessionInFolder(page, suite, rendered.user, opened);

  // `compact-turn` answers the prompt and then compacts in the same recording — two turns.
  await recordedTurns(page, 'compact-turn', 2);
  await recordedTurns(page, 'hook-message-turn', 3, ['Write']);
  await recordedTurns(page, 'mcp-media-result-turn', 4, [expected.mcpToolLabel]);
  await recordedTurns(page, 'denied-by-rule-turn', 5);
  await recordedTurns(page, 'unknown-variant-turn', 6);

  await expectTheConversation(page);

  // Reopened from the history — the backend's own `historicalEvents` rebuilds the same screen
  // (F5), not a second live recording.
  await reloaded(page);
  await expectTheConversation(page);
});
