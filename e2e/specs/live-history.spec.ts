import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { overflows, scrollTo } from '../fixtures/chat-layout';
import { conversationOf, messagesOn, panelOf } from '../fixtures/claude-panel';
import { workbenchSuite } from '../fixtures/folder-tree';
import { compactedElsewhere, plantedHistory, writtenElsewhere } from '../fixtures/history';
import type { RecordedEntries } from '../fixtures/history';
import { violationsOn } from '../fixtures/page-checks';
import { workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * A conversation that grows while it is read — plan 22, F7, B-35 (S-124…S-127).
 *
 * The conversation is the editor's: begun elsewhere, never opened by this product, and written on by
 * the other client **while the reader is open**. The scripted backend has a door into Claude's store
 * for it (`/e2e/conversations-elsewhere`, B-34, D-17): what lands there are the entries the SDK read
 * back of real runs, written now — which is what the follower of the backend looks at. Nothing here
 * reloads the page: what arrives, arrives by `transcript.follow`.
 *
 * The steps and the texts are those of `e2e/scenarios/live-history.json`, which the app reads too
 * (B-36): the English of each text, here; its key, there.
 */

/** One text of the scenario: the key of each end, what fills it, and the English it reads as. */
interface Text {
  readonly en: string;
}

/** One write of the other client, and what the reader shows after it. */
interface Step {
  readonly name: 'asks' | 'answers' | 'newer' | 'rewritten' | 'after';
  readonly append?: RecordedEntries;
  readonly chain?: string;
  readonly prompt?: string;
  readonly answer?: string;
  readonly said?: string;
  readonly gone?: string;
  readonly newer?: number;
  readonly working: boolean;
}

const live = scenario('live-history');
const expected = live.expect as {
  planted: { fixture: string; title: string; answer: string };
  steps: readonly Step[];
  bash: { command: string; title: string; lines: number; first: string; last: string };
  texts: Record<
    | 'activeElsewhere'
    | 'working'
    | 'newerLabel'
    | 'thought'
    | 'bashTitle'
    | 'bashRunning'
    | 'bashDone'
    | 'input'
    | 'output'
    | 'openImage'
    | 'imageAlt'
    | 'closeImage',
    Text
  >;
  tags: string[];
};
const { texts } = expected;

const suite = workbenchSuite(live.user);

/** A step of the scenario, by its name. */
function step(name: Step['name']): Step {
  const found = expected.steps.find((each) => each.name === name);

  if (found === undefined) {
    throw new Error(`live-history.json has no step ${name}`);
  }
  return found;
}

/** What the other client writes in a step: entries at the end, or a chain compacted. */
async function writes(conversationId: string, name: Step['name']): Promise<Step> {
  const { append, chain } = step(name);

  if (append !== undefined) {
    await writtenElsewhere(conversationId, append);
  }
  if (chain !== undefined) {
    await compactedElsewhere(conversationId, chain);
  }
  return step(name);
}

/** A line the reader shows, word for word. */
function line(page: Page, text: string): Locator {
  return conversationOf(page).getByText(text, { exact: true });
}

/** "Working in another client…", in the place under the conversation where it comes and goes. */
function working(page: Page): Locator {
  return panelOf(page).getByRole('status').filter({ hasText: texts.working.en });
}

/** "Working in another client…" on screen after a step, or not, as the scenario says. */
async function workingAsSaid(page: Page, after: Step): Promise<void> {
  await (after.working
    ? expect(working(page)).toBeVisible()
    : expect(working(page)).toHaveCount(0));
}

/** The one part of the reader that scrolls — the conversation. */
function readerScroller(page: Page): Locator {
  return panelOf(page)
    .getByRole('region', { name: expected.planted.title, exact: true })
    .locator('[data-chat-scroller]');
}

/**
 * Plants the conversation in a folder of the test, opens the folder, and reads the conversation from
 * the Sessions view — where it is listed as active elsewhere — in the panel. The page is marked, so
 * a reload, which would clear the mark, can be told apart from a conversation that grew.
 *
 * @returns the id of the conversation
 */
async function readerOfOneWrittenElsewhere(page: Page): Promise<string> {
  const folder = suite.tree().gamma;
  await suite.openTab(folder);
  const conversationId = await plantedHistory(
    folder,
    expected.planted.fixture,
    expected.planted.title,
  );

  await openSignedIn(page, live.user, workbenchAddress(folder));
  await page.getByRole('button', { name: 'Claude sessions', exact: true }).click();
  await page
    .getByRole('region', { name: /^Active elsewhere/ })
    .getByRole('button', { name: `Read the conversation ${expected.planted.title}` })
    .click();
  await expect(messagesOn(page).filter({ hasText: expected.planted.answer })).toHaveCount(1);
  await page.evaluate(() => {
    (globalThis as { e2eNotReloaded?: boolean }).e2eNotReloaded = true;
  });

  return conversationId;
}

/** Whether the page is still the one {@link readerOfOneWrittenElsewhere} marked. */
function notReloaded(page: Page): Promise<boolean> {
  return page.evaluate(() => (globalThis as { e2eNotReloaded?: boolean }).e2eNotReloaded === true);
}

test(`${live.id} — the conversation grows in the reader without a reload, and "working in another client" comes and goes (S-124); scrolled up it is "N new", which leads to the end (S-125); a rewritten chain is read again and still followed (S-126)`, async ({
  page,
}) => {
  const conversationId = await readerOfOneWrittenElsewhere(page);
  await expect(panelOf(page).getByText(texts.activeElsewhere.en)).toBeVisible();
  await expect(working(page)).toHaveCount(0);

  // S-124: a prompt and the call it made — the turn is open elsewhere.
  const asks = await writes(conversationId, 'asks');
  await expect(line(page, String(asks.prompt))).toBeVisible();
  await expect(panelOf(page).getByRole('button', { name: texts.bashRunning.en })).toBeVisible();
  await workingAsSaid(page, asks);

  // Its result and the answer: the turn closed, and the inference goes with it.
  const answers = await writes(conversationId, 'answers');
  await expect(line(page, String(answers.answer))).toBeVisible();
  await expect(panelOf(page).getByRole('button', { name: texts.bashDone.en })).toBeVisible();
  await workingAsSaid(page, answers);

  // S-125: scrolled up to read, what arrives is counted, not scrolled to.
  const scroller = readerScroller(page);
  expect(await overflows(scroller, 'down')).toBe(true);
  await scrollTo(scroller, 'top');
  const newer = await writes(conversationId, 'newer');
  const pill = panelOf(page).getByRole('button', { name: texts.newerLabel.en, exact: true });
  await expect(pill).toBeVisible();
  await expect(line(page, String(newer.answer))).not.toBeInViewport();
  await pill.click();
  await expect(pill).toHaveCount(0);
  await expect(line(page, String(newer.answer))).toBeInViewport();
  await workingAsSaid(page, newer);

  // S-126: compacted elsewhere — none of what the reader had is on the chain any more.
  const rewritten = await writes(conversationId, 'rewritten');
  await expect(conversationOf(page).getByText(String(rewritten.said))).toBeVisible();
  await expect(line(page, String(rewritten.gone))).toHaveCount(0);
  await expect(messagesOn(page).filter({ hasText: expected.planted.answer })).toHaveCount(0);
  // The chain ends on what the compaction wrote as the person's: the turn is open again.
  await workingAsSaid(page, rewritten);

  // ...and the reader follows the new chain.
  const after = await writes(conversationId, 'after');
  await expect(line(page, String(after.answer))).toBeVisible();
  await workingAsSaid(page, after);
  expect(await notReloaded(page)).toBe(true);
});

test(`${live.id} — what grows is read as the Claude Code shows it: the thought and how long at most, the title of the Bash call, its IN and its whole OUT, the image of the prompt opened — and axe finds nothing, in either theme (S-127)`, async ({
  page,
}) => {
  const conversationId = await readerOfOneWrittenElsewhere(page);

  for (const name of ['asks', 'answers', 'newer', 'after'] as const) {
    await writes(conversationId, name);
  }
  await expect(line(page, String(step('after').answer))).toBeVisible();

  // The thought, bounded by the instants of the history (D-14).
  await expect(line(page, texts.thought.en)).toBeVisible();

  // The Bash call under the title the model gave it — the command still in its name — and, unfolded,
  // what went in and the whole of what came out, not the end the timeline keeps.
  await expect(line(page, texts.bashTitle.en)).toBeVisible();
  await panelOf(page).getByRole('button', { name: texts.bashDone.en }).click();
  await expect(
    panelOf(page).getByRole('region', { name: texts.input.en }).locator('pre'),
  ).toHaveText(expected.bash.command);
  const output = panelOf(page).getByRole('region', { name: texts.output.en }).locator('pre');
  await expect
    .poll(async () => (await output.innerText()).trim().split('\n'))
    .toEqual(Array.from({ length: expected.bash.lines }, (_, index) => String(index + 1)));
  expect(await notReloaded(page)).toBe(true);
  expect(await violationsOn(page, expected.tags), 'the reader, grown').toEqual([]);

  // The image of the prompt, fetched when asked for and shown in a dialog of its own.
  await panelOf(page).getByRole('button', { name: texts.openImage.en }).click();
  const dialog = page.getByRole('dialog');
  const image = dialog.getByRole('img', { name: texts.imageAlt.en });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((element) => (element as { naturalWidth: number }).naturalWidth),
  ).toBe(16);
  expect(await violationsOn(page, expected.tags), 'the image, opened').toEqual([]);
  await dialog.getByRole('button', { name: texts.closeImage.en, exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The other set of colours: the muted thought, the state of the row and the output, in the dark.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  expect(await violationsOn(page, expected.tags), 'the reader, grown, dark').toEqual([]);
});
