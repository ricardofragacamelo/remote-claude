import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { conversationScroller, send, turnSummaries } from '../fixtures/claude-panel';
import { folderWith, literally } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { openFromDraft, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * Plan 24 through the browser: Claude asks — `AskUserQuestion` — and the person answers by a card
 * made for it, never by "Allow once" on a JSON of the questions.
 *
 * The recorded turn asks three questions at once: which sections (several), which format (one) and
 * which tone (one, answered here in words). The scripted Claude replays what the recording said
 * after it was answered, whatever the answer; that the answers — and a refusal's reason — reach the
 * SDK as the SDK takes them is proved against the real gateway in the integration suite (S-38,
 * S-50, S-58). What only a browser shows is proved here: the card, its steps, the line it becomes,
 * the deadline, two tabs of one person, and the width of a phone.
 */

const questions = scenario('questions');
const expected = questions.expect as {
  fixture: string;
  card: string;
  sections: string[];
  formatTab: string;
  format: string;
  other: string;
  otherText: string;
  otherAnswer: string;
  submit: string;
  decline: string;
  declineReason: string;
  reason: string;
  declineConfirm: string;
  declined: string;
  expired: string;
  askedMany: string;
  width: number;
};

const suite = workbenchSuite(questions.user);
const opened = sessionsOpened(suite.user);

/** The start of an accessible name: an option is named by its label and then its description. */
const startingWith = (text: string): RegExp => new RegExp(`^${literally(text)}`);

/** A session opened in a folder of the test: its address, and how many of its turns ended. */
async function aSession(page: Page): Promise<{ link: string; ended: number }> {
  const folder = folderWith(suite.tree().gamma, { 'notes.md': 'A project with no README yet.\n' });
  await suite.openTab(folder);
  await openSignedIn(page, questions.user, workbenchAddress(folder));
  const sessionId = await openFromDraft(page);
  opened(sessionId);

  return {
    link: `${workbenchAddress(folder)}&${new URLSearchParams({ session: sessionId }).toString()}`,
    ended: await turnSummaries(page).count(),
  };
}

/** The card of the question, in the conversation. */
function questionCard(page: Page): Locator {
  return conversationScroller(page).getByRole('listitem', { name: expected.card });
}

/** The line the question became once it ended. */
function questionLine(page: Page): Locator {
  return conversationScroller(page).getByRole('button', {
    name: new RegExp(expected.askedMany),
  });
}

/** Asks Claude the recorded turn, and waits for its card. */
async function asked(page: Page): Promise<Locator> {
  await send(page, `ask me first [fixture:${expected.fixture}]`);
  const card = questionCard(page);
  await expect(card).toBeVisible();

  return card;
}

/** Answers the three questions: two sections, a format, and a tone in words. */
async function answer(card: Locator): Promise<void> {
  for (const section of expected.sections) {
    await card.getByRole('checkbox', { name: startingWith(section) }).check();
  }
  await card.getByRole('tab', { name: startingWith(expected.formatTab) }).click();
  // A single choice that is not the last goes on to the next question by itself — so it is clicked,
  // not checked: the card has moved on before a check could read it back.
  await card.getByRole('radio', { name: startingWith(expected.format) }).click();
  await card.getByRole('radio', { name: startingWith(expected.other) }).check();
  await card.getByRole('textbox', { name: expected.other }).fill(expected.otherText);
  await card.getByRole('button', { name: expected.submit }).click();
}

test(`${questions.id} — one choice, several and in words, answered by the card (S-104)`, async ({
  page,
}) => {
  const { ended } = await aSession(page);

  await answer(await asked(page));

  // The card leaves; the line of the tool is the questions, with what was answered marked.
  await expect(questionCard(page)).toHaveCount(0);
  await expect(questionLine(page)).toHaveAttribute('aria-expanded', 'true');
  const answered = conversationScroller(page).locator('[data-answered-questions="answered"]');
  await expect(answered.getByText(expected.otherAnswer)).toBeVisible();
  for (const section of expected.sections) {
    await expect(
      // The option itself, not the question around it, which also holds its text.
      answered.getByRole('listitem').filter({ hasText: new RegExp(`^${literally(section)}$`) }),
    ).toHaveAttribute('aria-current', 'true');
  }
  // And the turn goes on to its end.
  await expect(turnSummaries(page)).toHaveCount(ended + 1);
});

test(`${questions.id} — not answered, with a reason (S-105)`, async ({ page }) => {
  const { ended } = await aSession(page);
  const card = await asked(page);

  await card.getByRole('button', { name: expected.decline }).click();
  await card.getByRole('textbox', { name: expected.declineReason }).fill(expected.reason);
  await card.getByRole('button', { name: expected.declineConfirm }).click();

  await expect(questionCard(page)).toHaveCount(0);
  await expect(
    conversationScroller(page).getByText(startingWith(expected.declined)).first(),
  ).toBeVisible();
  await expect(turnSummaries(page)).toHaveCount(ended + 1);
});

test(`${questions.id} — nobody answers, and the deadline refuses (S-106)`, async ({ page }) => {
  const { ended } = await aSession(page);
  await asked(page);

  // The stack's deadline for a question is short (`RC_QUESTION_TIMEOUT_MS`); silence never answers.
  await expect(conversationScroller(page).getByText(expected.expired)).toBeVisible({
    timeout: 45_000,
  });
  await expect(questionCard(page)).toHaveCount(0);
  await expect(turnSummaries(page)).toHaveCount(ended + 1);
});

test(`${questions.id} — answered in one tab, the other trades the card for the line (S-107)`, async ({
  page,
}) => {
  const { link } = await aSession(page);
  const other = await page.context().browser()?.newContext();
  if (other === undefined) {
    throw new Error('the browser of the test is not there');
  }

  try {
    const watching = await other.newPage();
    await openSignedIn(watching, questions.user, link);
    await expect(turnSummaries(watching)).toHaveCount(1);

    await answer(await asked(page));
    await expect(questionCard(watching)).toHaveCount(0);
    await expect(questionLine(watching)).toBeVisible();
    await expect(
      conversationScroller(watching)
        .locator('[data-answered-questions="answered"]')
        .getByText(expected.otherAnswer),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test(`${questions.id} — four questions fit the width of a phone (S-67)`, async ({ page }) => {
  await page.setViewportSize({ width: expected.width, height: 800 });
  await aSession(page);
  const card = await asked(page);

  const overflow = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // And neither does the page around it.
  const whole = await page
    .locator('html')
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(whole).toBeLessThanOrEqual(0);
});
