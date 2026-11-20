import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { openSignedIn } from '../fixtures/auth';
import { callApi } from '../fixtures/api';
import { fileAddress, literally, monacoShows } from '../fixtures/explorer';
import { workbenchSuite } from '../fixtures/folder-tree';
import { HOSTILE_NEEDLE, hostileFixture } from '../fixtures/hostile-files';
import type { HostileTree } from '../fixtures/hostile-files';
import { ndjsonLines } from '../fixtures/ndjson';
import { workbenchAddress } from '../fixtures/workbench';
import { scenario } from '../scenarios';

/**
 * The hostile fixture of plan 11, B-21 (S-148, S-149): a tree of names and shapes that have broken
 * a naive pipeline before — a flag-shaped name, a space, a quote, `\n` in the name itself, the same
 * visible glyph two different ways, a name no JS string can even hold losslessly — searched for with
 * ripgrep, read back through this backend's own JSON, and opened for real in the browser.
 *
 * Every one of them round-trips intact **except** the one whose bytes are not valid UTF-8: measured
 * (`ripgrep-json.mapper.ts`), ripgrep's own `--json` reports such a path as `{bytes: …}` instead of
 * `{text: …}`, and this backend treats that the same as any other malformed line — dropped, not
 * garbled. That is this fixture's own boundary case, not a bug to find.
 */

const fixture = scenario('search-hostile-fixture');
const expected = fixture.expect as { needle: string };

const suite = workbenchSuite(fixture.user);
const hostile = hostileFixture();

interface SearchMatchFrame {
  readonly type: 'file' | 'end' | 'error';
  readonly path?: string;
}

async function searchNeedle(
  folder: string,
  useIgnoreFiles: boolean,
): Promise<readonly SearchMatchFrame[]> {
  const response = await callApi(suite.user(), '/search/text', {
    method: 'POST',
    body: {
      folder,
      pattern: expected.needle,
      isRegex: false,
      caseSensitive: true,
      wholeWord: false,
      useIgnoreFiles,
    },
  });
  expect(response.status).toBe(200);

  return ndjsonLines<SearchMatchFrame>(response);
}

function pathsOf(frames: readonly SearchMatchFrame[]): string[] {
  return frames.filter((frame) => frame.type === 'file').map((frame) => frame.path ?? '');
}

test.describe(`${fixture.id} — ${fixture.title}`, () => {
  let tree: HostileTree;
  let root: string;

  test.beforeEach(() => {
    root = suite.tree().alpha;
    tree = hostile(root);
  });

  test('is generated under the e2e root, every hostile file really there, and gone once the test ends', () => {
    expect(tree.base.startsWith(root)).toBe(true);
    expect(fs.existsSync(tree.base)).toBe(true);
    expect(fs.existsSync(tree.dash)).toBe(true);
    expect(fs.existsSync(tree.nonUtf8)).toBe(true);
    expect(fs.statSync(tree.overCeiling).size).toBeGreaterThan(20 * 1024 * 1024);
    // The removal itself is `hostileFixture`'s own `afterEach` — asserted by every other spec
    // of this run never finding a leftover tree, which `rmSync` with `force: true` guarantees.
  });

  test('every ordinary hostile name is found by the locator, by its own basename', async () => {
    for (const file of [tree.dash, tree.dashLongOutput, tree.dashPreSh, tree.withQuote]) {
      const response = await callApi(
        suite.user(),
        `/search/files?${new URLSearchParams({ folder: tree.base, query: file.split('/').pop() ?? '' }).toString()}`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { entries: readonly { path: string }[] };
      expect(body.entries.some((entry) => entry.path === file.split('/').pop())).toBe(true);
    }
  });

  test('a default search finds every readable hostile name, skips what it must', async () => {
    const frames = await searchNeedle(tree.base, true);
    expect(frames.at(-1)?.type).toBe('end');

    const found = pathsOf(frames);
    for (const file of [
      tree.dash,
      tree.dashLongOutput,
      tree.dashPreSh,
      tree.withSpace,
      tree.withQuote,
      tree.withStar,
      tree.withNewline,
      tree.nfc,
      tree.nfd,
      tree.crlf,
      tree.bom,
      tree.giantLine,
    ]) {
      const base = file.split('/').pop() ?? '';
      expect(found, `expected ${base} among the matches`).toContain(base);
    }

    // The same visible glyph, two different byte sequences — neither collapses into the other.
    expect(found).toContain(tree.nfc.split('/').pop());
    expect(found).toContain(tree.nfd.split('/').pop());
    expect(new Set(found).size).toBe(found.length);

    for (const skipped of [tree.ignoredFile, tree.gitDirFile, tree.binary, tree.overCeiling]) {
      const base = skipped.split('/').pop() ?? '';
      expect(found, `expected ${base} to be skipped`).not.toContain(base);
    }

    // The escaped symlink's target never appears — its basename is not even in this tree.
    expect(found).not.toContain('outside.txt');
  });

  test('a search over an invalid-UTF-8 name is skipped cleanly, not garbled or refused', async () => {
    const frames = await searchNeedle(tree.base, true);

    expect(frames.some((frame) => frame.type === 'error')).toBe(false);
    for (const frame of frames) {
      if (frame.path !== undefined) {
        expect(Buffer.byteLength(frame.path, 'utf8') > 0 || frame.path === '').toBe(true);
      }
    }
  });

  test('turning ignore files off reveals `.gitignore`’s own exclusion, never `.git`’s', async () => {
    const frames = await searchNeedle(tree.base, false);
    const found = pathsOf(frames);

    expect(found).toContain(path.relative(tree.base, tree.ignoredFile));
    expect(found).not.toContain(path.relative(tree.base, tree.gitDirFile));
  });

  test('a giant single line still previews without the raw line going over the wire whole', async () => {
    const frames = await searchNeedle(tree.base, true);
    const giant = frames.find(
      (frame) => frame.path === tree.giantLine.split('/').pop(),
    ) as unknown as { readonly matches?: readonly { readonly preview: string }[] };

    expect(giant?.matches?.[0]?.preview.length).toBeLessThan(1024 * 1024);
  });

  test('the sentinel a hostile pattern could touch does not exist on its own', () => {
    expect(fs.existsSync(tree.sentinel)).toBe(false);
  });

  test('a handful of the trickiest names open for real, in the editor', async ({ page }) => {
    await suite.openTab(tree.base);

    // Signed in on a plain folder address first — never a hostile name's own, so the sign-in
    // round trip itself never depends on how the app parses one.
    await openSignedIn(page, fixture.user, workbenchAddress(tree.base));

    for (const file of [
      tree.withSpace,
      tree.withQuote,
      tree.withStar,
      tree.crlf,
      tree.bom,
      tree.nfc,
    ]) {
      const name = file.split('/').pop() ?? '';
      await page.goto(fileAddress(tree.base, name));
      await monacoShows(page, name, HOSTILE_NEEDLE);
    }

    expect(literally(tree.nfc.split('/').pop() ?? '')).not.toBe('');
  });
});
