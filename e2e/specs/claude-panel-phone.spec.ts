import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { panelOf, recordedTurn } from '../fixtures/claude-panel';
import { folderWith } from '../fixtures/explorer';
import { sessionsOpened, workbenchSuite } from '../fixtures/folder-tree';
import { scrollsSideways, violationsOn, widerThanThePage } from '../fixtures/page-checks';
import { openFromDraft, workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The panel of Claude on a phone, in a real browser — plan 08, F6, B-56 (S-268).
 *
 * The integration suite proves which view is shown; what only a browser that lays pages out can say
 * is the measure — no horizontal scroll at 360 px, with a conversation that has a diff, a tool row and
 * a markdown answer in it — and what axe says of the stylesheet that ships.
 */

const sessions = scenario('panel-sessions');
const expected = sessions.expect as {
  phone: { width: number; height: number };
  tags: string[];
  phoneTurn: string;
};

test.use({ viewport: expected.phone, isMobile: true, hasTouch: true });

const suite = workbenchSuite(sessions.user);
const opened = sessionsOpened(suite.user);

test(`${sessions.id} — on a phone the panel is a view of its own, with no horizontal scroll and nothing for axe (S-268)`, async ({
  page,
}) => {
  const folder = folderWith(suite.tree().gamma, {
    'notes.md': 'The project has two goals: be safe, and be fast.\n',
  });
  await suite.openTab(folder);
  await openSignedIn(page, sessions.user, workbenchAddress(folder));

  // One view at a time: the panel, with nothing of the editor beside it.
  const bar = page.getByRole('navigation', { name: 'Views of this folder' });
  await bar.getByRole('button', { name: 'Claude' }).click();
  await expect(panelOf(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Editor' })).toHaveCount(0);

  opened(await openFromDraft(page));
  await recordedTurn(page, expected.phoneTurn, ['Write']);

  expect(await scrollsSideways(page), (await widerThanThePage(page)).join('\n')).toBe(false);
  expect(await violationsOn(page, expected.tags)).toEqual([]);
});
