import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bundledCliVersion } from '@adapter/outbound/claude/cli-version';

/** A package laid out the way the SDK's is: an entry point and, maybe, a manifest beside it. */
function aPackage(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'rc-cli-version-'));
  mkdirSync(path.join(root, 'dist'));

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, name), content, 'utf8');
  }

  return path.join(root, 'dist', 'sdk.mjs');
}

describe('bundledCliVersion', () => {
  it('reads the version of the binary the installed SDK ships', () => {
    expect(bundledCliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reads the manifest at the root of the package the entry belongs to', () => {
    const entry = aPackage({ 'package.json': '{}', 'manifest.json': '{"version":"9.8.7"}' });

    expect(bundledCliVersion(() => entry)).toBe('9.8.7');
  });

  it('answers null for a package without a manifest, and looks no further up', () => {
    const entry = aPackage({ 'package.json': '{}' });

    expect(bundledCliVersion(() => entry)).toBeNull();
  });

  it('answers null for a manifest that is not JSON', () => {
    const entry = aPackage({ 'package.json': '{}', 'manifest.json': 'not json' });

    expect(bundledCliVersion(() => entry)).toBeNull();
  });

  it('answers null for a manifest without a version string', () => {
    const entry = aPackage({ 'package.json': '{}', 'manifest.json': '{"version":2}' });

    expect(bundledCliVersion(() => entry)).toBeNull();
  });

  it('answers null when the SDK cannot be resolved', () => {
    expect(
      bundledCliVersion(() => {
        throw new Error('Cannot find module');
      }),
    ).toBeNull();
  });

  it('answers null when no directory up to the root is a package', () => {
    expect(bundledCliVersion(() => '/sdk.mjs')).toBeNull();
  });
});
