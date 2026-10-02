import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

/** The repository, where the script that builds the web in memory lives. */
const root = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');

/**
 * The build as it ships, analysed by `scripts/editor-bundle.mjs` — in a process of its own: the
 * bundler cannot run inside jsdom, where these suites live. Nothing is written to `web/dist`.
 */
async function analysed(): Promise<{
  initialMonacoModules: string[];
  lazyChunks: string[];
  worker: string | null;
  cdnHits: string[];
  problems: string[];
}> {
  try {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [path.join(root, 'scripts', 'editor-bundle.mjs'), '--json'],
      { cwd: root, maxBuffer: 16 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as Awaited<ReturnType<typeof analysed>>;
  } catch (error) {
    // A problem found exits 1 and still prints the analysis — that is the answer to assert on.
    return JSON.parse((error as { stdout: string }).stdout) as Awaited<ReturnType<typeof analysed>>;
  }
}

describe('the editor in the build — plan 07, S-204', () => {
  it('is a chunk of its own, loaded on demand, never in the first page, and nothing comes from a CDN', async () => {
    const bundle = await analysed();

    expect(bundle.initialMonacoModules).toEqual([]);
    expect(bundle.lazyChunks.some((name) => name.includes('monaco-engine'))).toBe(true);
    expect(bundle.worker).toMatch(/editor\.worker-.*\.js$/);
    expect(bundle.cdnHits).toEqual([]);
    expect(bundle.problems).toEqual([]);
  }, 240_000);
});
