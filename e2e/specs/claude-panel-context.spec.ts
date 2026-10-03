import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  contextChips,
  conversationOfSession,
  dropFromDesktop,
  menuOf,
  messagesOn,
  panelOf,
  promptBox,
  RED_PNG,
  sendButton,
  turnSummaries,
} from '../fixtures/claude-panel';
import { folderWith, literally, rowOf } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { transcriptOf } from '../fixtures/history';
import type { TranscriptPage } from '../fixtures/history';
import { sessionInTab } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The context of a prompt, through the door a person uses — plan 08, F6, B-54 (S-258…S-260).
 *
 * The three ways a file reaches a prompt — chosen with `@`, dragged from the explorer, dropped from
 * the desktop — each proved by what **arrived**: the prompt the scripted Claude was handed, as the
 * store of conversations keeps it, and the `Read` of the file the audit trail recorded. The `/` menu
 * reads the catalogue the CLI answered, recorded in a workspace with a skill of its own; and a path
 * out of the folder is refused by the backend, with the draft left as it was.
 */

const context = scenario('panel-context');
const expected = context.expect as {
  notes: string;
  dragged: { name: string; content: string };
  image: string;
  mention: string;
  referenceTurn: string;
  text: string;
  references: string[];
  answer: string;
  readTool: string;
  skill: string;
  skillBadge: string;
  skillTurn: string;
  skillAnswer: string;
  outside: string;
  outsideNote: string;
  refused: string;
};

const suite = workbenchSuite(context.user);
const opened = sessionsOpened(suite.user);

/** A folder of the test with the files of the scenario, as a tab, and a session opened in it. */
async function sessionHere(page: Page): Promise<string> {
  const folder = folderWith(suite.tree().gamma, {
    'notes.md': expected.notes,
    [expected.dragged.name]: expected.dragged.content,
  });
  await suite.openTab(folder);
  const sessionId = await sessionInTab(page, context.user, folder);
  opened(sessionId);

  return sessionId;
}

/** The conversation a session writes to. */
function conversationOf(sessionId: string): Promise<string> {
  return conversationOfSession(suite.user(), sessionId);
}

/** The prompts of a conversation as the store keeps them: their text, and the kinds of their blocks. */
function promptsOf(transcript: TranscriptPage): { text: string; kinds: string[] }[] {
  return transcript.events
    .filter((event) => event.type === 'message.completed' && event.payload['role'] === 'user')
    .map((event) => {
      const blocks =
        (event.payload['content'] as { type: string; text?: string }[] | undefined) ?? [];
      return {
        text: blocks.map((block) => block.text ?? '').join(''),
        kinds: blocks.map((block) => block.type),
      };
    });
}

/** Writes the text after what the box holds, and sends it with Enter, once it can be sent. */
async function typeAndSend(page: Page, text: string): Promise<void> {
  await promptBox(page).press('End');
  await promptBox(page).pressSequentially(text);
  await expect(sendButton(page)).toBeEnabled();
  await promptBox(page).press('Enter');
}

test(`${context.id} — a file chosen with @, one dragged from the explorer and an image from the desktop reach Claude, and the Read is in the audit trail (S-258)`, async ({
  page,
}) => {
  const sessionId = await sessionHere(page);

  // `@` offers the files of the folder; Enter takes the first, and it becomes a chip.
  await promptBox(page).pressSequentially(expected.mention);
  await expect(menuOf(page, 'files').getByRole('option').first()).toContainText('notes.md');
  await promptBox(page).press('Enter');
  await expect(contextChips(page).getByText('notes.md', { exact: true })).toBeVisible();

  // Dragged from the explorer, onto the box.
  await rowOf(page, expected.dragged.name).dragTo(promptBox(page));
  await expect(contextChips(page).getByText(expected.dragged.name, { exact: true })).toBeVisible();

  // Dropped from the desktop: a real image, uploaded to the session.
  await dropFromDesktop(page, promptBox(page), {
    name: expected.image,
    type: 'image/png',
    base64: RED_PNG,
  });
  await expect(contextChips(page).getByText(expected.image, { exact: true })).toBeVisible();

  const summaries = await turnSummaries(page).count();
  await typeAndSend(page, `${expected.text} [fixture:${expected.referenceTurn}]`);
  await expect(turnSummaries(page)).toHaveCount(summaries + 1);
  await expect(messagesOn(page).last()).toContainText(expected.answer);

  // What arrived: the two references after the text, and the image beside it.
  const prompts = promptsOf(await transcriptOf(suite.user(), await conversationOf(sessionId)));
  const sent = prompts.at(-1);
  expect(sent?.text).toContain(expected.text);
  for (const reference of expected.references) {
    expect(sent?.text).toContain(reference);
  }
  expect(sent?.kinds).toContain('image');
  // Nothing of the context is left for the next prompt.
  await expect(contextChips(page)).toHaveCount(0);

  // And the file was read by the tool, under the hook: the audit trail has it.
  await page.goto(
    `/audit?${new URLSearchParams({ sessionId, toolName: expected.readTool }).toString()}`,
  );
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: expected.readTool })
      .filter({ hasText: 'notes.md' }),
  ).not.toHaveCount(0);
});

test(`${context.id} — / lists the skill of the project with its badge, and choosing it fires it (S-259)`, async ({
  page,
}) => {
  const sessionId = await sessionHere(page);

  await promptBox(page).pressSequentially(`/${expected.skill.slice(0, 4)}`);
  const option = menuOf(page, 'commands').getByRole('option').filter({ hasText: expected.skill });
  await expect(option).toHaveCount(1);
  await expect(option).toContainText(expected.skillBadge);

  await promptBox(page).press('Enter');
  await expect(promptBox(page)).toHaveValue(new RegExp(`^/${literally(expected.skill)} `));

  const summaries = await turnSummaries(page).count();
  await typeAndSend(page, `[fixture:${expected.skillTurn}]`);
  await expect(turnSummaries(page)).toHaveCount(summaries + 1);
  await expect(messagesOn(page).last()).toContainText(expected.skillAnswer);

  // It went to Claude as the command, the way the CLI runs a skill.
  const prompts = promptsOf(await transcriptOf(suite.user(), await conversationOf(sessionId)));
  expect(prompts.at(-1)?.text.startsWith(`/${expected.skill} `)).toBe(true);
});

test(`${context.id} — context out of the folder is refused with the error translated, and the draft stays (S-260)`, async ({
  page,
}) => {
  await sessionHere(page);

  // Typed, it is never offered — only to be used as typed, and checked when it is sent.
  await promptBox(page).pressSequentially(`@${expected.outside}`);
  await expect(panelOf(page).getByText(expected.outsideNote)).toBeVisible();
  await promptBox(page).press('Enter');
  await expect(contextChips(page).getByText(expected.outside, { exact: true })).toBeVisible();

  const summaries = await turnSummaries(page).count();
  await typeAndSend(page, expected.text);

  // The backend refuses it, translated — and nothing ran: the text and the chip are still there.
  await expect(
    panelOf(page).getByText(new RegExp(`^${literally(expected.refused)}`)),
  ).toBeVisible();
  await expect(promptBox(page)).toHaveValue(new RegExp(literally(expected.text)));
  await expect(contextChips(page).getByText(expected.outside, { exact: true })).toBeVisible();
  await expect(turnSummaries(page)).toHaveCount(summaries);
});
