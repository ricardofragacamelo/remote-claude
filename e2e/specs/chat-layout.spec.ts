import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { approvedPhone, connectedPhone } from '../fixtures/devices';
import { attachFrom, permissionAsked } from '../fixtures/live-session';
import {
  documentScrolls,
  overflows,
  scrollTo,
  scrollTopOf,
  wholeInView,
} from '../fixtures/chat-layout';
import {
  allowOnce,
  cardInPlaceOf,
  composerBar,
  conversationOf,
  conversationScroller,
  conversationTabs,
  decisionLine,
  draftFrame,
  historyButton,
  inlineCardFor,
  interruptButton,
  modeChip,
  newConversationButton,
  openedSessionOf,
  panelOf,
  pendingPill,
  promptBox,
  recordedTurn,
  send,
  sessionLabelOf,
  sessionMenuButton,
  thoughtLines,
  turnSummaries,
  workingIndicator,
} from '../fixtures/claude-panel';
import { folderWith } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { scrollsSideways, widerThanThePage } from '../fixtures/page-checks';
import { openFromDraft, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The frame of the panel of Claude, in a real browser — plan 09, F1 (S-05, S-06, S-13, S-15, S-16),
 * and what F2 and F3 put in it: the bar of the box by keyboard (S-36), the history a click away
 * (S-45), the header in one strip with ten tabs (S-46) and the phone with its keyboard open (S-91).
 * Since F4 and F5: the turn inline, from the prompt to its summary (S-83), the pill that brings a
 * question back into view (S-67), a phone that answers, stopping once, and a long conversation at
 * the three sizes (S-82).
 *
 * The integration suite proves what the frame holds and what it keeps; only a browser that lays the
 * page out can say what scrolls, and whether the box is where a person can reach it — with a
 * conversation longer than the panel, in a narrow panel, on a phone, and
 * across `md`.
 */

const layout = scenario('chat-layout');
const expected = layout.expect as {
  desktop: { width: number; height: number };
  short: { width: number; height: number };
  phone: { width: number; height: number };
  turn: string;
  maxTurns: number;
  written: string;
  slack: number;
  keyboard: { width: number; height: number };
  tabs: number;
  inlineTurn: string;
  inlineTool: string;
  thoughtTurn: string;
  thoughtTool: string;
  heldTurn: string;
  decidedHere: string;
  decidedOnPhone: string;
  waiting: string;
};

test.use({ viewport: expected.desktop });

const suite = workbenchSuite(layout.user);
const opened = sessionsOpened(suite.user);

/** The bar of the views of a folder, below `md`. */
function viewBar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Views of this folder' });
}

/** Signs in on a folder tab of this test, with nothing in its panel but a draft. */
async function aFolderTab(page: Page): Promise<void> {
  const folder = folderWith(suite.tree().gamma, { 'notes.md': 'Two goals: safe, and fast.\n' });
  await suite.openTab(folder);
  await openSignedIn(page, layout.user, workbenchAddress(folder));
}

/**
 * Drags the handle between the editor and the panel — the one at the panel's left edge — as far
 * right as the panel allows: its minimum width (D-04).
 */
async function narrowestPanel(page: Page, edge: number): Promise<void> {
  const handles = await page.getByRole('separator').all();
  const boxes = await Promise.all(handles.map((handle) => handle.boundingBox()));
  const handle = boxes.find((box) => box !== null && Math.abs(box.x - edge) < 12);
  if (handle === undefined || handle === null) {
    throw new Error('no handle at the left edge of the panel');
  }

  const y = handle.y + 40;
  await page.mouse.move(handle.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(expected.short.width - 4, y, { steps: 8 });
  await page.mouse.up();
}

/** The page itself scrolls neither down nor sideways — only the conversation does. */
async function expectThePageStill(page: Page): Promise<void> {
  expect(await documentScrolls(page)).toBe(false);
  expect(await scrollsSideways(page), (await widerThanThePage(page)).join('\n')).toBe(false);
}

/** Whether a scroller shows its end. */
function atTheEnd(scroller: Locator): Promise<boolean> {
  return scroller.evaluate(
    (element) => element.scrollHeight - element.scrollTop - element.clientHeight <= 1,
  );
}

/** Whether the conversation holds more than twice what its scroller shows. */
function longerThanTwoScreens(scroller: Locator): Promise<boolean> {
  return scroller.evaluate((element) => element.scrollHeight > element.clientHeight * 2);
}

/** A session whose conversation is longer than two screens of the panel. */
async function aLongConversation(page: Page): Promise<void> {
  opened(await openFromDraft(page));
  const scroller = conversationScroller(page);

  for (let turn = 1; turn < expected.maxTurns; turn += 1) {
    if (await longerThanTwoScreens(scroller)) break;
    await recordedTurn(page, expected.turn, [], `turn ${String(turn)}`);
  }
  expect(await longerThanTwoScreens(scroller)).toBe(true);
}

/** A session on a phone of `size`, the panel of Claude the view on screen. */
async function aPhoneSession(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await aFolderTab(page);
  await viewBar(page).getByRole('button', { name: 'Claude' }).click();
  opened(await openFromDraft(page));
}

/** A long conversation read up to a point: its session, and where its scroller was left. */
async function aConversationReadHalfway(
  page: Page,
): Promise<{ readonly sessionId: string; readonly left: number }> {
  await aFolderTab(page);
  await aLongConversation(page);
  const sessionId = await openedSessionOf(page);
  await scrollTo(conversationScroller(page), 120);

  return { sessionId, left: await scrollTopOf(conversationScroller(page)) };
}

/**
 * The conversation is where the person read, give or take what a narrower layout moved — two lines:
 * neither the top nor the end it would jump to if the scroll were lost.
 */
async function stillWhereLeft(page: Page, left: number): Promise<void> {
  await expect
    .poll(async () => Math.abs((await scrollTopOf(conversationScroller(page))) - left))
    .toBeLessThanOrEqual(expected.slack);
}

test(`${layout.id} — only the conversation scrolls, and the box is in view at its top and its end (S-05, S-06)`, async ({
  page,
}) => {
  await aFolderTab(page);

  // Empty: the draft, with the box at the bottom of the panel.
  await expect(draftFrame(page)).toBeVisible();
  expect(await wholeInView(promptBox(page))).toBe(true);
  expect(await documentScrolls(page)).toBe(false);

  await aLongConversation(page);
  const scroller = conversationScroller(page);

  // At the end, where it follows what arrives…
  expect(await wholeInView(promptBox(page))).toBe(true);
  // …and at the top: the box never left.
  await scrollTo(scroller, 'top');
  expect(await wholeInView(promptBox(page))).toBe(true);

  // The conversation is what scrolls; the side bar and the page do not.
  expect(await overflows(scroller, 'down')).toBe(true);
  expect(await overflows(panelOf(page), 'down')).toBe(false);
  await expectThePageStill(page);
});

test(`${layout.id} — in the narrowest panel, nothing scrolls sideways and the box stays (S-13)`, async ({
  page,
}) => {
  await page.setViewportSize(expected.short);
  await aFolderTab(page);
  opened(await openFromDraft(page));

  const aside = await panelOf(page).boundingBox();
  await narrowestPanel(page, aside?.x ?? 0);
  const narrow = await panelOf(page).boundingBox();
  expect(narrow?.width ?? 0).toBeLessThan(aside?.width ?? 0);

  expect(await overflows(panelOf(page), 'sideways')).toBe(false);
  expect(await scrollsSideways(page), (await widerThanThePage(page)).join('\n')).toBe(false);
  expect(await wholeInView(promptBox(page))).toBe(true);
});

test(`${layout.id} — on a phone, the box is above the bar of the views and inside what is seen (S-15)`, async ({
  page,
}) => {
  // 360×640 here; 360×400 — the keyboard open — is the S-91, below.
  await aPhoneSession(page, expected.phone);

  await promptBox(page).focus();
  expect(await wholeInView(promptBox(page), viewBar(page))).toBe(true);
  await expectThePageStill(page);
});

test(`${layout.id} — crossing md both ways keeps the text, the scroll and the tab of the panel (S-16)`, async ({
  page,
}) => {
  const { sessionId, left } = await aConversationReadHalfway(page);
  await promptBox(page).fill(expected.written);

  await page.setViewportSize(expected.phone);
  await viewBar(page).getByRole('button', { name: 'Claude' }).click();
  await expect(promptBox(page)).toHaveValue(expected.written);
  expect(await openedSessionOf(page)).toBe(sessionId);

  await page.setViewportSize(expected.desktop);
  await expect(sessionLabelOf(page)).toBeVisible();
  await expect(promptBox(page)).toHaveValue(expected.written);
  expect(await openedSessionOf(page)).toBe(sessionId);
  await stillWhereLeft(page, left);
  expect(await scrollTopOf(conversationScroller(page))).toBeGreaterThan(0);
  expect(await atTheEnd(conversationScroller(page))).toBe(false);
});

test(`${layout.id} — on a phone with its keyboard open, the box is whole above the bar of the views (S-91)`, async ({
  page,
}) => {
  await aPhoneSession(page, expected.keyboard);

  await promptBox(page).focus();
  expect(await wholeInView(promptBox(page), viewBar(page))).toBe(true);
  expect(await wholeInView(composerBar(page), viewBar(page))).toBe(true);
  await expectThePageStill(page);
});

test(`${layout.id} — in a narrow panel with ten conversations, the tabs scroll in their strip and the header keeps its buttons (S-46)`, async ({
  page,
}) => {
  await page.setViewportSize(expected.short);
  await aFolderTab(page);
  const aside = await panelOf(page).boundingBox();
  await narrowestPanel(page, aside?.x ?? 0);

  while ((await conversationTabs(page).getByRole('listitem').count()) < expected.tabs) {
    await newConversationButton(page).click();
  }

  expect(await overflows(conversationTabs(page), 'sideways')).toBe(true);
  for (const button of [
    newConversationButton(page),
    historyButton(page),
    sessionMenuButton(page),
  ]) {
    expect(await wholeInView(button)).toBe(true);
  }
  expect(await overflows(panelOf(page), 'sideways')).toBe(false);
  expect(await wholeInView(promptBox(page))).toBe(true);
  await expectThePageStill(page);
});

test(`${layout.id} — the history of the folder is a click away, and the conversation stays as it was (S-45)`, async ({
  page,
}) => {
  const { sessionId, left } = await aConversationReadHalfway(page);

  await historyButton(page).click();

  const sessions = page.getByRole('button', { name: 'Claude sessions', exact: true });
  await expect(sessions).toHaveAttribute('aria-pressed', 'true');
  // The conversation of the session is listed, and opening it brings the same tab back.
  await page
    .getByRole('button', { name: /^Open the session/ })
    .first()
    .click();
  expect(await openedSessionOf(page)).toBe(sessionId);
  await stillWhereLeft(page, left);
});

test(`${layout.id} — by keyboard alone, Tab goes from the box along the bar in the order it is seen, and a menu gives the focus back (S-36)`, async ({
  page,
}) => {
  await aFolderTab(page);
  opened(await openFromDraft(page));
  const bar = composerBar(page);
  await expect(bar.getByRole('button', { name: /^Context window/ })).toBeVisible();

  // The controls of the bar a person sees and can use, left to right — what Tab has to walk.
  await promptBox(page).fill('ready');
  const seen: string[] = [];
  const lefts: number[] = [];
  for (const button of await bar.getByRole('button').all()) {
    const box = await button.boundingBox();
    if (box !== null && box.width > 0 && (await button.isEnabled())) {
      seen.push((await button.getAttribute('aria-label')) ?? '');
      lefts.push(box.x);
    }
  }
  expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
  expect(seen.at(-1)).toBe('Send');

  await promptBox(page).focus();
  const walked: string[] = [];
  while (walked.length < seen.length) {
    await page.keyboard.press('Tab');
    walked.push((await page.locator(':focus').getAttribute('aria-label')) ?? '');
  }
  expect(walked).toEqual(seen);

  // A chip opens its menu with Enter, closes it with Esc, and the focus is back on it.
  await modeChip(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(modeChip(page)).toBeFocused();
});

/** The box is whole in view — above the bar of the views, on a phone. */
async function boxInView(page: Page): Promise<void> {
  const phone = (page.viewportSize()?.width ?? expected.desktop.width) < 768;
  expect(await wholeInView(promptBox(page), phone ? viewBar(page) : undefined)).toBe(true);
}

for (const [name, size] of [
  ['desktop', expected.desktop],
  ['short', expected.short],
  ['phone', expected.phone],
] as const) {
  test(`${layout.id} — ${String(size.width)}×${String(size.height)}, a long conversation: the box in view at its top and its end, the page still, nothing sideways (S-82)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await aFolderTab(page);
    if (name === 'phone') {
      await viewBar(page).getByRole('button', { name: 'Claude' }).click();
    }
    if (name === 'short') {
      const aside = await panelOf(page).boundingBox();
      await narrowestPanel(page, aside?.x ?? 0);
    }
    await aLongConversation(page);
    const scroller = conversationScroller(page);

    await boxInView(page);
    await scrollTo(scroller, 'top');
    await boxInView(page);
    await scrollTo(scroller, 'end');
    await boxInView(page);

    expect(await overflows(scroller, 'down')).toBe(true);
    expect(await overflows(panelOf(page), 'down')).toBe(false);
    expect(await overflows(panelOf(page), 'sideways')).toBe(false);
    await expectThePageStill(page);
  });
}

/** A session opened from the draft of a folder tab: how many turns of it ended, so far. */
async function aSessionOpened(page: Page): Promise<number> {
  await aFolderTab(page);
  opened(await openFromDraft(page));
  return turnSummaries(page).count();
}

/**
 * Sends the recorded turn whose first tool asks, and waits for its card — in the conversation, in
 * the place of the tool.
 */
async function aQuestionInline(page: Page): Promise<Locator> {
  await send(page, `do the work [fixture:${expected.inlineTurn}]`);
  const card = cardInPlaceOf(page, expected.inlineTool);
  await expect(card).toBeVisible();
  return card;
}

test(`${layout.id} — the turn inline: its line at the end, the thought, the card in the place of its tool, the decision and the summary — the box in view at every step (S-83)`, async ({
  page,
}) => {
  const before = await aSessionOpened(page);

  await send(page, `do the work [fixture:${expected.thoughtTurn}]`);
  await expect(workingIndicator(page)).toBeVisible();
  await boxInView(page);

  // The scripted backend asks about the `Write` before it announces the tool and the thought before
  // it, so the card waits at the end of the conversation (D-12) and the thought comes after the
  // answer. "Thinking…" while it arrives is too short-lived in a replay: the integration suite
  // proves it (S-54). In place, the card is the cases below.
  const card = inlineCardFor(page, expected.thoughtTool);
  await expect(card).toBeVisible();
  await expect(workingIndicator(page)).toContainText(expected.waiting);
  await boxInView(page);

  await allowOnce(card).click();
  await expect(card).toHaveCount(0);
  await expect(decisionLine(page, expected.decidedHere)).toBeVisible();
  await expect(thoughtLines(page).first()).toBeVisible();
  await boxInView(page);

  await expect(turnSummaries(page)).toHaveCount(before + 1);
  await expect(workingIndicator(page)).toHaveCount(0);
  // In the order it happened: the thought, then the tool with its decision under it.
  const order = await conversationOf(page)
    .locator(':scope > li')
    .evaluateAll(
      (items, decided) =>
        items
          .map((item) =>
            item.querySelector('details') !== null
              ? 'thought'
              : item.textContent.includes(decided)
                ? 'decided'
                : '',
          )
          .filter((kind) => kind !== ''),
      expected.decidedHere,
    );
  expect(order.indexOf('thought')).toBeLessThan(order.indexOf('decided'));
  await boxInView(page);
});

test(`${layout.id} — scrolled up with a question open, the pill above the box takes you to it (S-67)`, async ({
  page,
}) => {
  await aFolderTab(page);
  await aLongConversation(page);
  const card = await aQuestionInline(page);

  await scrollTo(conversationScroller(page), 'top');
  await expect(pendingPill(page)).toBeVisible();
  await boxInView(page);

  await pendingPill(page).click();
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport();
  await expect(pendingPill(page)).toHaveCount(0);

  await allowOnce(card).click();
  await expect(card).toHaveCount(0);
});

test(`${layout.id} — a question answered on a phone becomes the line of its tool, saying so (S-83, S-62)`, async ({
  page,
}) => {
  await aFolderTab(page);
  const sessionId = await openFromDraft(page);
  opened(sessionId);
  const phone = await connectedPhone(suite.user(), await approvedPhone(suite.user()));
  try {
    await attachFrom(phone, sessionId, 0);
    await aQuestionInline(page);

    const asked = await permissionAsked(phone);
    phone.respond(asked, {
      requestId: (asked.payload as { requestId?: unknown }).requestId,
      decision: 'allow',
      scope: 'once',
    });

    await expect(cardInPlaceOf(page, expected.inlineTool)).toHaveCount(0);
    await expect(decisionLine(page, new RegExp(expected.decidedOnPhone))).toBeVisible();
    await boxInView(page);
  } finally {
    phone.close();
  }
});

test(`${layout.id} — stop in the bar of the box interrupts the turn once, however often it is pressed (S-83)`, async ({
  page,
}) => {
  const before = await aSessionOpened(page);

  await send(page, `hold on [fixture:${expected.heldTurn}] [hold]`);
  await expect(workingIndicator(page)).toBeVisible();
  await interruptButton(page).dblclick();

  await expect(workingIndicator(page)).toHaveCount(0);
  await expect(turnSummaries(page)).toHaveCount(before + 1);
  await boxInView(page);
});

test(`${layout.id} — by keyboard alone: the prompt by Enter, the question by its command, allowed by Tab and Enter (S-85)`, async ({
  page,
}) => {
  const before = await aSessionOpened(page);

  await promptBox(page).focus();
  await page.keyboard.type(`do the work [fixture:${expected.inlineTurn}]`);
  await page.keyboard.press('Enter');
  const card = cardInPlaceOf(page, expected.inlineTool);
  await expect(card).toBeVisible();
  // The question did not take the focus from who was writing (D-13).
  await expect(promptBox(page)).toBeFocused();

  await page.keyboard.press('ControlOrMeta+Alt+P');
  await expect(card).toBeFocused();
  const allow = allowOnce(card);
  for (
    let step = 0;
    step < 6 && !(await allow.evaluate((el) => el === el.ownerDocument.activeElement));
    step += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(allow).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(decisionLine(page, expected.decidedHere)).toBeVisible();
  await expect(turnSummaries(page)).toHaveCount(before + 1);
});

test(`${layout.id} — on a phone, the turn inline in the view Claude, the box above the bar of the views (S-85)`, async ({
  page,
}) => {
  await aPhoneSession(page, expected.phone);

  const card = await aQuestionInline(page);
  await boxInView(page);
  await allowOnce(card).click();

  await expect(decisionLine(page, expected.decidedHere)).toBeVisible();
  await expect(workingIndicator(page)).toHaveCount(0);
  await boxInView(page);
  await expectThePageStill(page);
});

test(`${layout.id} — on a phone with its keyboard open, a question keeps the box whole and is announced above it; the keyboard closed, it is answered (S-85)`, async ({
  page,
}) => {
  await aPhoneSession(page, expected.keyboard);

  // With the keyboard open the conversation has almost no height — a sliver of the card, or none —
  // and the question is said aloud above the box (D-13), the box whole under it. Whether the pill
  // shows depends on that sliver: a card partly in view is in view.
  await send(page, `do the work [fixture:${expected.inlineTurn}]`);
  await expect(
    panelOf(page)
      .getByRole('status')
      .filter({ hasText: /^Claude is waiting for your answer \(1\)$/ }),
  ).toHaveCount(1);
  await boxInView(page);
  await expectThePageStill(page);

  // The keyboard closed, the card is there to answer, in the place of its tool.
  await page.setViewportSize(expected.phone);
  const card = cardInPlaceOf(page, expected.inlineTool);
  await allowOnce(card).click();

  await expect(decisionLine(page, expected.decidedHere)).toBeVisible();
  await boxInView(page);
});
