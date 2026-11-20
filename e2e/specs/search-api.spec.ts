import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { folderWith } from '../fixtures/explorer';
import { workbenchSuite } from '../fixtures/folder-tree';
import { ndjsonLines } from '../fixtures/ndjson';
import { scenario } from '../scenarios';

/**
 * The search API, against the real backend — plan 11, B-22 (S-150, S-152, S-153, S-154).
 *
 * What the integration suite already proves at the controller boundary (B-09…B-12) is not repeated
 * here. What only the running process can say: a hostile pattern or replacement text never reaches
 * a shell (nothing here spawns one — `child_process` calls never pass `shell: true`, and the
 * pattern travels as one `--regexp=` argv element, after a `--`); a folder outside every allowlist
 * root is refused with the status the contract promises; the locator's own shape (folders, `prefer`,
 * ignored entries, its truncation ceiling).
 */

const api = scenario('search-api');
const suite = workbenchSuite(api.user);

interface ErrorBody {
  readonly error?: { readonly code?: string; readonly httpEquivalent?: number };
}

interface SearchFrame {
  readonly type: 'file' | 'end' | 'error';
}

async function searchText(
  folder: string,
  overrides: Readonly<Record<string, unknown>>,
): Promise<Response> {
  return callApi(suite.user(), '/search/text', {
    method: 'POST',
    body: {
      folder,
      pattern: 'x',
      isRegex: false,
      caseSensitive: false,
      wholeWord: false,
      useIgnoreFiles: true,
      ...overrides,
    },
  });
}

test.describe(`${api.id} — ${api.title}`, () => {
  test('the locator lists a folder as its own kind', async () => {
    const base = suite.tree().alpha;
    // `widgets/` needs a file inside: the locator derives directory candidates from file paths'
    // own ancestors (`find-paths.use-case.ts`'s `deriveEntries`) — an empty directory is invisible
    // to it, the same way it would be to `rg --files`.
    folderWith(base, { 'widgets/inside.ts': 'x' });

    const response = await callApi(
      suite.user(),
      `/search/files?${new URLSearchParams({ folder: base, kinds: 'file,dir', query: 'widget' }).toString()}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: readonly { path: string; kind: string }[] };
    expect(body.entries.some((entry) => entry.kind === 'dir' && entry.path === 'widgets')).toBe(
      true,
    );
  });

  test('`prefer` reorders an equally-good match to the front, without hiding a clearly better one', async () => {
    const base = suite.tree().alpha;
    // No directory here at all — a dir's own exact-basename match can outscore `prefer`'s bonus
    // by design (`PREFER_SCORE_BONUS` is deliberately smaller than that gap); this test is about
    // `prefer` among files alone, so nothing else is left to outrank them.
    folderWith(base, { 'widget.ts': 'x', 'sub/widget.ts': 'x' });

    const locate = (query: Readonly<Record<string, string>>): Promise<Response> =>
      callApi(
        suite.user(),
        `/search/files?${new URLSearchParams({ folder: base, kinds: 'file', ...query }).toString()}`,
      );

    const plain = await locate({ query: 'widget.ts' });
    const plainBody = (await plain.json()) as { entries: readonly { path: string }[] };
    expect(plainBody.entries[0]?.path).toBe('widget.ts');

    const preferred = await locate({ query: 'widget.ts', prefer: 'sub/widget.ts' });
    const preferredBody = (await preferred.json()) as { entries: readonly { path: string }[] };
    expect(preferredBody.entries[0]?.path).toBe('sub/widget.ts');
    // The much better match is still there — `prefer` moves it to the front, never hides it.
    expect(preferredBody.entries.some((entry) => entry.path === 'widget.ts')).toBe(true);
  });

  test('ignored entries stay out of the locator unless asked for, and a wide query hits its own ceiling', async () => {
    const base = suite.tree().alpha;
    fs.writeFileSync(path.join(base, '.gitignore'), 'ignored-widget.ts\n');
    fs.writeFileSync(path.join(base, 'ignored-widget.ts'), 'x');

    const withoutIgnored = await callApi(
      suite.user(),
      `/search/files?${new URLSearchParams({ folder: base, query: 'ignored-widget' }).toString()}`,
    );
    const withoutBody = (await withoutIgnored.json()) as { entries: readonly { path: string }[] };
    expect(withoutBody.entries).toHaveLength(0);

    // A fresh folder, never the one above: the locator caches its raw listing by folder alone
    // (S-56) — asking the very same folder again inside that window would just replay the first
    // answer, `includeIgnored` or not, and prove nothing about the toggle itself.
    const secondBase = suite.tree().alpha;
    fs.writeFileSync(path.join(secondBase, '.gitignore'), 'ignored-widget.ts\n');
    fs.writeFileSync(path.join(secondBase, 'ignored-widget.ts'), 'x');

    const withIgnored = await callApi(
      suite.user(),
      `/search/files?${new URLSearchParams({ folder: secondBase, query: 'ignored-widget', includeIgnored: 'true' }).toString()}`,
    );
    const withBody = (await withIgnored.json()) as { entries: readonly { path: string }[] };
    expect(withBody.entries.some((entry) => entry.path === 'ignored-widget.ts')).toBe(true);

    const thirdBase = suite.tree().alpha;
    for (let index = 0; index < 60; index += 1) {
      fs.writeFileSync(path.join(thirdBase, `ceiling-widget-${String(index)}.ts`), 'x');
    }
    const wide = await callApi(
      suite.user(),
      `/search/files?${new URLSearchParams({ folder: thirdBase, query: 'ceiling-widget' }).toString()}`,
    );
    const wideBody = (await wide.json()) as { entries: readonly unknown[] };
    // More matches than `RC_SEARCH_LOCATE_DEFAULT_RESULTS` (50) — the page is capped, silently;
    // `truncated` names only the engine's own file-count ceiling (far above 60), never this.
    expect(wideBody.entries.length).toBeLessThanOrEqual(50);
    expect(wideBody.entries.length).toBeGreaterThan(0);
  });

  test('a folder outside every allowlist root is refused with 403 WORKSPACE_NOT_ALLOWED', async () => {
    const response = await callApi(
      suite.user(),
      `/search/files?${new URLSearchParams({ folder: suite.tree().outside, query: 'x' }).toString()}`,
    );
    expect(response.status).toBe(403);

    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('WORKSPACE_NOT_ALLOWED');
    expect(body.error?.httpEquivalent).toBe(403);
  });

  test('a glob reaching past the open folder with `..` is refused as input, not followed', async () => {
    const base = suite.tree().alpha;
    const response = await searchText(base, { include: ['../*'] });

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.error?.code).toBe('INVALID_INPUT');
  });

  test('`--pre=sh` as a pattern, and as a glob, never reaches a shell', async () => {
    const base = suite.tree().alpha;
    folderWith(base, { 'plain.txt': 'ordinary text\n' });

    const asPattern = await searchText(base, { pattern: '--pre=sh' });
    expect(asPattern.status).toBe(200);
    expect((await ndjsonLines<SearchFrame>(asPattern)).at(-1)?.type).toBe('end');

    const asGlob = await searchText(base, { include: ['--pre=x'] });
    expect([200, 400]).toContain(asGlob.status);
  });

  test('`$(touch sentinel)` in the pattern and in the replacement text never runs a command', async () => {
    const base = suite.tree().alpha;
    folderWith(base, { 'plain.txt': 'ordinary text\n' });
    const sentinel = path.join(base, 'sentinel-touched-by-injection.txt');
    const command = `$(touch ${sentinel})`;

    const searched = await searchText(base, { pattern: command });
    expect(searched.status).toBe(200);
    expect((await ndjsonLines<SearchFrame>(searched)).at(-1)?.type).toBe('end');

    const previewed = await callApi(suite.user(), '/search/replace/preview', {
      method: 'POST',
      body: {
        folder: base,
        pattern: 'ordinary',
        isRegex: false,
        caseSensitive: false,
        wholeWord: false,
        useIgnoreFiles: true,
        replacement: command,
        preserveCase: false,
      },
    });
    expect(previewed.status).toBe(200);
    expect((await ndjsonLines<SearchFrame>(previewed)).at(-1)?.type).toBe('end');

    expect(fs.existsSync(sentinel)).toBe(false);
  });

  // S-152's own status-vs-contract check — every search route with no credential — lives in
  // `http-contract.spec.ts`'s own `REFUSALS` table, next to every other route's: one place answers
  // "does the status match the contract", for every route at once (S-19).
});
