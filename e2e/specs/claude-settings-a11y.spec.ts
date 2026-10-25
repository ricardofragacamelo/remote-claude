import { expect, test } from '@playwright/test';

import { settingsAddress } from '../fixtures/agent-settings';
import { openSignedIn } from '../fixtures/auth';
import { workbenchSuite } from '../fixtures/folder-tree';
import { violationsOn, scrollsSideways } from '../fixtures/page-checks';
import { mcpSettingsAddress, removeMcpServerNamed, serverCreated } from '../fixtures/project-mcp';
import { scenario } from '../scenarios';

/**
 * Usability and accessibility of the agent settings screen, in a real browser — plan 13, F4, B-45.
 *
 * Four things only a browser that lays pages out and runs real keyboard/locale behaviour can prove,
 * the same division `workbench-a11y.spec.ts`, `workbench-phone.spec.ts` and `engine-neutral-panel.spec.ts`
 * already draw for the workbench and for plan 28's own test engine: axe on the stylesheet that ships
 * (S-195a), a wizard walked by the keyboard alone (S-195b), a phone's own layout and its translated
 * help drawer (S-195c, S-195d), and the neutral test engine of [28 · F7](../../docs/plans/28-agent-neutral-core/F7-e2e.md)
 * showing only the core section it announces (S-195e).
 *
 * Colour contrast of the shared design system (buttons, inputs, labels) across both themes is already
 * proven once, generically, by `workbench-a11y.spec.ts` — this spec never repeats that sweep, only
 * what is this screen's own: its structure, its wizard, its phone layout and its help.
 */

const a11y = scenario('claude-settings-a11y');
const expected = a11y.expect as {
  tags: readonly string[];
  sections: readonly { id: string; heading: string }[];
  phone: { width: number; height: number };
  serverName: string;
  engineId: string;
  agentName: string;
};

const suite = workbenchSuite(a11y.user);

test.use({ viewport: { width: 1920, height: 1080 } });

test(`${a11y.id} — axe finds no violation in any of the seven sections (S-195a)`, async ({
  page,
}) => {
  const folder = suite.tree().alpha;
  let signedIn = false;

  for (const section of expected.sections) {
    const address = settingsAddress(section.id, folder);

    if (signedIn) {
      await page.goto(address);
    } else {
      await openSignedIn(page, a11y.user, address);
      signedIn = true;
    }

    await expect(page.getByRole('heading', { level: 2, name: section.heading })).toBeVisible();
    expect(await violationsOn(page, expected.tags), section.id).toEqual([]);
  }
});

test(`${a11y.id} — the "Add server" wizard completes by keyboard alone (S-195b)`, async ({
  page,
}) => {
  const tree = suite.tree();
  // Defensive: a previous run interrupted mid-test would otherwise collide on the server's name.
  await removeMcpServerNamed(suite.user(), expected.serverName);

  try {
    await openSignedIn(page, a11y.user, mcpSettingsAddress(tree.alpha));

    // Opening the wizard itself is the first keyboard step — never a click.
    await page.getByRole('button', { name: 'Add server', exact: true }).focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Add server' })).toBeVisible();

    // Radix focuses the first field itself when the dialog opens — the tab order from there walks
    // every field of the form, stdio and scope left at their own defaults, filled as the keyboard
    // reaches each one. Never a mouse click, and never a trap: reaching "Confirm" at the end proves
    // both at once (S-195).
    await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
    await page.keyboard.type(expected.serverName);

    // Not `exact`: a `<select>`'s own accessible name folds in the text of whichever `<option>` is
    // already selected (the same fact `claude-settings.spec.ts`'s own `fieldSelect` documents) — both
    // start on a real value ("stdio", "Every session"), so only the label's own leading text is
    // stable.
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel(/^Transport/)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel(/^Scope/)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Command', { exact: true })).toBeFocused();
    await page.keyboard.type('node');

    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Arguments, one per line', { exact: true })).toBeFocused();
    await page.keyboard.type('e2e/fixtures/mcp-server/fixture-mcp-server.mjs');

    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Add a variable' })).toBeFocused();
    await page.keyboard.press('Enter');

    // The row "Add a variable" just revealed takes the keyboard itself (S-195) — without that, it
    // sits before that same button in the DOM, and a keyboard walking forward from it would skip
    // straight past the row it just added.
    await expect(dialog.getByLabel('Variable name', { exact: true })).toBeFocused();
    await page.keyboard.type('TOKEN');

    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Variable value', { exact: true })).toBeFocused();
    await page.keyboard.type('shh');

    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Remove this row' })).toBeFocused();

    // "Add a variable" is still there after adding one — a second one is still possible.
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Add a variable' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeFocused();

    const [, preview] = await Promise.all([
      page.keyboard.press('Enter'),
      dialog.getByRole('button', { name: 'Confirm', exact: true }).waitFor(),
    ]);
    void preview;

    // The preview step's own focus goes to the step itself, never straight to "Confirm" (S-140) —
    // walking from there by keyboard still reaches it, in order.
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Confirm', exact: true })).toBeFocused();

    const created = await serverCreated(page, () => page.keyboard.press('Enter'));
    expect(created.status()).toBe(201);

    await expect(page.getByText(expected.serverName, { exact: true })).toBeVisible();
  } finally {
    await removeMcpServerNamed(suite.user(), expected.serverName);
  }
});

test(`${a11y.id} — a phone keeps no horizontal scroll, the sections become a selector, and the help drawer opens, translated, with a working "learn more" (S-195c, S-195d)`, async ({
  page,
  browser,
}) => {
  await page.setViewportSize(expected.phone);
  await openSignedIn(page, a11y.user, settingsAddress('models'));
  expect(await scrollsSideways(page)).toBe(false);

  // The navigation is a selector, not a row of tabs that would wrap off the side of the screen.
  await expect(
    page.getByRole('navigation', { name: 'Sections of Claude Code settings' }),
  ).toHaveCount(0);
  const picker = page.getByRole('button', { name: 'Section: Models and defaults' });
  await expect(picker).toBeVisible();

  await picker.click();
  for (const section of expected.sections) {
    await expect(page.getByRole('menuitemradio', { name: section.heading })).toBeVisible();
  }
  await page.keyboard.press('Escape');

  // The "learn more" beside the model field opens the drawer scrolled to the part that answers it —
  // the field's own section, never the drawer's top (S-195d).
  await page.getByRole('button', { name: 'Learn more about Model', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Help: Claude Code settings' });
  await expect(drawer).toBeVisible();
  // The part itself takes the focus (it is what scrolls into view) — its heading just labels it.
  await expect(drawer.getByRole('region', { name: 'Models' })).toBeFocused();
  expect(await scrollsSideways(page)).toBe(false);
  await drawer.getByRole('button', { name: 'Close the help' }).click();
  await expect(drawer).toBeHidden();

  // Opened generically instead, the drawer carries every part of the screen's own help.
  await page.getByRole('button', { name: 'Help for this screen' }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'What this screen is' })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Shortcuts' })).toBeVisible();

  // In pt-BR, the same screen — a separate context, its own locale: the drawer, and the "learn
  // more" it answers, read the other catalogue too (S-195d).
  const other = await browser.newContext({ locale: 'pt-BR', viewport: expected.phone });
  const ptPage = await other.newPage();
  try {
    await openSignedIn(ptPage, a11y.user, settingsAddress('models'), undefined, 'Entrar');
    await ptPage.getByRole('button', { name: 'Saiba mais sobre Modelo', exact: true }).click();
    const ptDrawer = ptPage.getByRole('dialog', { name: 'Ajuda: Configurações do Claude Code' });
    await expect(ptDrawer).toBeVisible();
    await expect(ptDrawer.getByRole('region', { name: 'Modelos' })).toBeFocused();
  } finally {
    await other.close();
  }
});

test(`${a11y.id} — the neutral test engine shows only the core section it announces (S-195e)`, async ({
  page,
}) => {
  await openSignedIn(page, a11y.user, settingsAddress('models', undefined, expected.engineId));

  await expect(page.getByRole('heading', { level: 2, name: 'Models and defaults' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: `Sections of ${expected.agentName} settings` });
  await expect(nav.getByRole('button')).toHaveCount(1);

  for (const section of expected.sections) {
    if (section.id !== 'models') {
      // Scoped to the sections nav itself — the app's own global Settings has an unrelated
      // "Account" link of its own, elsewhere on the page.
      await expect(nav.getByRole('button', { name: section.heading })).toHaveCount(0);
    }
  }
});
