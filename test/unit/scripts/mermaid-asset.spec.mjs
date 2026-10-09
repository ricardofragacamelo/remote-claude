import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MERMAID_VERSION,
  describeMermaidSync,
  mermaidAssetPaths,
  prepareMermaid,
  syncMermaidAsset,
} from '../../../scripts/lib/mermaid-asset.mjs';

/**
 * A repository with the web's Mermaid installed at [version], or none.
 *
 * @param {string | null} version
 */
function aRepository(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-mermaid-'));
  if (version !== null) {
    const { manifest, source } = mermaidAssetPaths(root);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ name: 'mermaid', version }));
    fs.writeFileSync(source, `/* mermaid ${version} */`);
  }
  return root;
}

describe('the mermaid of the app — plan 25, D-20', () => {
  it('copies the web’s file into the app, and then has nothing to do', () => {
    const root = aRepository(MERMAID_VERSION);

    expect(syncMermaidAsset(root)).toEqual({ state: 'copied', version: MERMAID_VERSION });
    expect(fs.readFileSync(mermaidAssetPaths(root).target, 'utf8')).toBe(
      `/* mermaid ${MERMAID_VERSION} */`,
    );
    expect(syncMermaidAsset(root)).toEqual({ state: 'current', version: MERMAID_VERSION });
  });

  it('copies again when the app’s copy differs from the web’s', () => {
    const root = aRepository(MERMAID_VERSION);
    syncMermaidAsset(root);
    fs.writeFileSync(mermaidAssetPaths(root).target, 'stale');

    expect(syncMermaidAsset(root).state).toBe('copied');
  });

  it('refuses a web on another Mermaid — the two move together', () => {
    const root = aRepository('12.2.0');

    expect(syncMermaidAsset(root)).toEqual({
      state: 'mismatch',
      installed: '12.2.0',
      expected: MERMAID_VERSION,
    });
    expect(fs.existsSync(mermaidAssetPaths(root).target)).toBe(false);
  });

  it('says what is missing when the web’s dependencies are not installed', () => {
    const sync = syncMermaidAsset(aRepository(null));

    expect(sync.state).toBe('missing');
  });

  it('reads a manifest without a version as another version', () => {
    const root = aRepository(MERMAID_VERSION);
    fs.writeFileSync(mermaidAssetPaths(root).manifest, '{}');

    expect(syncMermaidAsset(root)).toMatchObject({ state: 'mismatch', installed: '' });
  });

  it('says each outcome in words, and which ones stop the build', () => {
    expect(describeMermaidSync({ state: 'copied', version: '1' })).toEqual({
      ok: true,
      message: 'mermaid 1 copied into the app',
    });
    expect(describeMermaidSync({ state: 'current', version: '1' }).ok).toBe(true);
    expect(describeMermaidSync({ state: 'missing', reason: 'x' })).toMatchObject({ ok: false });
    expect(
      describeMermaidSync({ state: 'mismatch', installed: '2', expected: '1' }).message,
    ).toContain('mermaid 2');
  });

  it('before a build, says what happened, and stops it when the file cannot come', () => {
    expect(prepareMermaid(aRepository(MERMAID_VERSION))).toBe(true);
    expect(prepareMermaid(aRepository('11.0.0'))).toBe(false);
  });

  it('the web of this repository is on the version the app draws with', () => {
    const manifest = path.join(
      import.meta.dirname,
      '../../../web/node_modules/mermaid/package.json',
    );
    expect(JSON.parse(fs.readFileSync(manifest, 'utf8')).version).toBe(MERMAID_VERSION);
  });
});
