import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import {
  cardFor,
  connectedStatus,
  contextMeter,
  decisionLine,
  enginePickerChip,
  openedSessionOf,
  panelOf,
  pickEngine,
  recordedTurn,
} from '../fixtures/claude-panel';
import { folderWith } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * Plan 28, F7, B-44 — the web panel of a second engine, for real (S-123, S-124).
 *
 * The neutrality gate (`pnpm neutral:check`) proves the **absence** of a motor's name in the
 * source; it proves nothing about a running screen. This is the test that does: a conversation
 * opened on the test engine of B-43 — other native tools, fewer capabilities, its own scripted
 * turns — rendered by the same web build Claude's own e2e specs run against.
 *
 * Every locator below but the engine picker itself is the **unmodified** one `claude-panel.ts` has
 * carried since plan 09 — `recordedTurn`, `cardFor`, `decisionLine` — called with
 * `agent: "Test agent"` instead of their Claude default. That reuse succeeding unchanged is the
 * proof of S-123: the panel draws a `kind` by the `kind`, never by which engine sent it.
 */

const neutral = scenario('engine-neutral-panel');
const expected = neutral.expect as {
  agentName: string;
  fixture: string;
  toolName: string;
  decision: string;
};

// Wide enough for the engine chip to sit directly in the bar, never behind "More choices": a
// narrower panel is already covered by S-18 of plan 09's chat-layout suite, for the mode alone.
test.use({ viewport: { width: 1920, height: 1080 } });

const suite = workbenchSuite(neutral.user);
const opened = sessionsOpened(suite.user);

/** No element of the panel ever says the word, in any case — the literal check of S-124. */
async function expectNoClaude(page: Page, agent: string): Promise<void> {
  await expect(panelOf(page, agent).getByText(/claude/i)).toHaveCount(0);
}

/** A fresh folder tab, signed in, with nothing in its panel yet but a draft. */
async function aDraftTab(page: Page): Promise<void> {
  const folder = folderWith(suite.tree().gamma, { 'notes.md': 'Two goals: safe, and fast.\n' });
  await suite.openTab(folder);
  await openSignedIn(page, neutral.user, workbenchAddress(folder));
  await expect(connectedStatus(page)).toBeVisible();
}

test(`${neutral.id} — ${neutral.title}`, async ({ page }) => {
  await aDraftTab(page);

  // The picker exists only because this installation drives more than one engine (S-124) — and it
  // starts on the installation's default, same as a draft that never touches it.
  await expect(enginePickerChip(page, 'Claude Code', 'Installation default')).toBeVisible();

  await pickEngine(page, expected.agentName);

  // Chosen, not yet running: the side bar already carries it, and it says nothing of Claude
  // (S-124) — the draft's own text reads by the engine just picked, not the installation's default.
  await expect(panelOf(page, expected.agentName)).toBeVisible();
  await expectNoClaude(page, expected.agentName);

  // The same `recordedTurn` every Claude spec calls — a write, approved once, ending the turn —
  // called here with the test engine's own side bar name and nothing else different (S-123).
  await recordedTurn(
    page,
    expected.fixture,
    [expected.toolName],
    'do the work',
    expected.agentName,
  );

  await expect(decisionLine(page, expected.decision, expected.agentName)).toBeVisible();
  // The approved call left no card of its own lying around — only the canonical decision line.
  await expect(cardFor(page, expected.toolName, expected.agentName)).toHaveCount(0);

  // What the test engine never announces stays gone once the session is live (S-124): no meter of
  // the context window at all, for an engine whose `contextUse` capability is off — never asked
  // for, never drawn, rather than drawn empty or disabled.
  await expect(contextMeter(page, expected.agentName)).toHaveCount(0);

  // And nowhere on the panel does the word "Claude" ever appear, turn included (S-124).
  await expectNoClaude(page, expected.agentName);

  opened(await openedSessionOf(page, expected.agentName));
});
