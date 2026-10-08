import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  interruptButton,
  messagesOn,
  openedSessionOf,
  panelOf,
  recordedTurn,
  reloaded,
  send,
  toolRow,
  turnsEnded,
} from '../fixtures/claude-panel';
import { editorTab, folderWith, literally } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { onWorkbenchOf, sessionInTab } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The conversation in the panel of Claude, through the door a person uses — plan 08, F6, B-53
 * (S-255…S-257).
 *
 * The integration suite proves each piece against frames it hands over; what only the whole stack
 * says is that the turns a recording replays — written by the scripted backend into the store it
 * reads, and onto the disk of the folder — come out as the panel draws them: the markdown, one line
 * per tool, the diff opened in the editor of the same folder tab, thinking, the task list and a
 * subagent nested under its tool. And that a reload, even in the middle of a turn, comes back to the
 * same tab and the same conversation, with nothing twice.
 *
 * Every test works in a folder of its own inside the root, and starts and ends with no tab.
 */

const rendered = scenario('panel-conversation');
const expected = rendered.expect as {
  notes: string;
  toolTurn: string;
  bold: string;
  listItems: number;
  tools: Record<'read' | 'bash' | 'bashCommand' | 'write', string>;
  wrote: string;
  diffTab: string;
  thinkingTurn: string;
  thought: string;
  taskTurn: string;
  tasksDone: string;
  pendingTask: string;
  subagentTurn: string;
  subagentNotes: string;
  subagent: string;
  subagentSaid: string;
  subagentRead: string;
  heldTurn: string;
  heldAnswer: string;
  heldPrompt: string;
};

const suite = workbenchSuite(rendered.user);
const opened = sessionsOpened(suite.user);

/** A folder of the test with the files given, as a tab, and a session opened in it. */
async function sessionIn(page: Page, files: Readonly<Record<string, string>>): Promise<string> {
  const folder = folderWith(suite.tree().gamma, files);
  await suite.openTab(folder);
  const sessionId = await sessionInTab(page, rendered.user, folder);
  opened(sessionId);

  return folder;
}

/** The task list, folded into one line above the box (plan 09, B-26) — "1/3 · Write b.txt". */
function taskList(page: Page): ReturnType<Page['getByRole']> {
  return panelOf(page).getByRole('region', {
    name: 'The task list Claude keeps for this conversation',
  });
}

/** What the subagent said, unfolded under the row of the tool that opened it. */
async function subagentSaid(page: Page): Promise<ReturnType<Page['getByRole']>> {
  const row = toolRow(page, expected.subagent);
  if ((await row.getAttribute('aria-expanded')) !== 'true') {
    await row.click();
  }

  return panelOf(page).getByRole('list', { name: 'What the subagent said' });
}

/** Thinking, the task list and the subagent, as the panel shows them now. */
async function expectTheThreeOnScreen(page: Page): Promise<void> {
  const thinking = panelOf(page)
    .locator('details')
    .filter({ hasText: /^Thought/ });
  await expect(thinking).toHaveCount(1);
  await thinking.locator('summary').click();
  await expect(thinking).toContainText(expected.thought);

  await expect(taskList(page)).toContainText(expected.tasksDone);
  await expect(taskList(page)).toContainText(expected.pendingTask);

  const nested = await subagentSaid(page);
  await expect(nested.getByText(expected.subagentSaid)).toBeVisible();
  await expect(
    nested.getByRole('button', { name: new RegExp(`^${expected.subagentRead} — Done`) }),
  ).toBeVisible();
}

test(`${rendered.id} — a prompt, its markdown answer, the tools in one line each, and the diff opened in the editor of the same tab (S-255)`, async ({
  page,
}) => {
  const folder = await sessionIn(page, { 'notes.md': expected.notes });

  await recordedTurn(page, expected.toolTurn, ['Write']);

  // The answer is markdown, drawn: the bold and the numbered list of the recording.
  const answer = messagesOn(page).last();
  await expect(answer.locator('strong').first()).toHaveText(expected.bold);
  await expect(answer.locator('ol > li')).toHaveCount(expected.listItems);

  // Each tool is one line, with its state; unfolded, the exact input.
  await expect(toolRow(page, new RegExp(expected.tools.read)).first()).toBeVisible();
  const bash = toolRow(page, expected.tools.bash);
  await bash.click();
  await expect(bash).toHaveAttribute('aria-expanded', 'true');
  // A shell call unfolds into IN, the command as it was sent (plan 22, B-29).
  await expect(
    panelOf(page).getByRole('region', { name: 'The exact input', exact: true }).locator('pre'),
  ).toHaveText(expected.tools.bashCommand);

  // The write shows its diff in the chat, and opens it in the editor — the same folder tab.
  await expect(toolRow(page, new RegExp(expected.tools.write))).toBeVisible();
  await panelOf(page).getByRole('button', { name: 'Open diff', exact: true }).click();
  await expect(editorTab(page, 1, new RegExp(`^${literally(expected.diffTab)}`))).toBeVisible();
  await expect(page.locator('.monaco-diff-editor').first()).toContainText(expected.wrote);
  expect(onWorkbenchOf(folder)(new URL(page.url()))).toBe(true);
});

test(`${rendered.id} — thinking, the task list and a subagent nested under its tool, live and the same after a reload (S-256)`, async ({
  page,
}) => {
  await sessionIn(page, { 'notes.md': expected.subagentNotes });

  await recordedTurn(page, expected.thinkingTurn);
  await recordedTurn(page, expected.taskTurn, ['Write']);
  await recordedTurn(page, expected.subagentTurn);
  await expectTheThreeOnScreen(page);

  await reloaded(page);
  await expect(turnsEnded(page, 4)).toBeVisible();
  await expectTheThreeOnScreen(page);
});

test(`${rendered.id} — reloading in the middle of a turn comes back to the same tab and conversation, nothing twice (S-257)`, async ({
  page,
}) => {
  const folder = await sessionIn(page, {});
  const sessionId = await openedSessionOf(page);
  const answered = messagesOn(page).filter({ hasText: expected.heldAnswer });
  const asked = messagesOn(page).filter({ hasText: expected.heldPrompt });

  // A turn that answers and does not end: its last message waits for an interrupt.
  await send(page, `${expected.heldPrompt} [fixture:${expected.heldTurn}]`);
  await expect(answered).toHaveCount(1);
  const interrupt = interruptButton(page);
  await expect(interrupt).toBeEnabled();

  await reloaded(page);

  // The same folder tab, the same conversation, each message once — and the turn still running.
  expect(onWorkbenchOf(folder)(new URL(page.url()))).toBe(true);
  expect(await openedSessionOf(page)).toBe(sessionId);
  await expect(answered).toHaveCount(1);
  await expect(asked).toHaveCount(1);
  await expect(interrupt).toBeEnabled();

  // Interrupted, it ends; what the reload brought back is still there once.
  await interrupt.click();
  await expect(turnsEnded(page, 2)).toBeVisible();
  await expect(answered).toHaveCount(1);
  await expect(asked).toHaveCount(1);
});
