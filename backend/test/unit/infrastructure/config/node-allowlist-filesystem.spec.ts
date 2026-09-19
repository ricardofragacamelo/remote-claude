import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { nodeAllowlistFileSystem } from '@infra/config/reloadable-workspace-allowlist';

/**
 * The two calls the allowlist loader makes, against a real filesystem.
 *
 * Real, because what is being checked is what `realpathSync` does with a symlink and what happens
 * to a root that is not there — neither of which a stub would tell the truth about.
 */
describe('nodeAllowlistFileSystem', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(path.join(tmpdir(), 'rc-allowfs-'));
    mkdirSync(path.join(base, 'projects'));
    writeFileSync(path.join(base, 'notes.md'), 'x', 'utf8');
    writeFileSync(path.join(base, 'allowlist.yaml'), 'roots: []\n', 'utf8');
    symlinkSync(path.join(base, 'projects'), path.join(base, 'link'));
    symlinkSync(path.join(base, 'nowhere'), path.join(base, 'dangling'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('reads the file', () => {
    expect(nodeAllowlistFileSystem.read(path.join(base, 'allowlist.yaml'))).toBe('roots: []\n');
  });

  it('throws on a file that is not there, so the loader can name it', () => {
    expect(() => nodeAllowlistFileSystem.read(path.join(base, 'gone.yaml'))).toThrow();
  });

  it('answers the real path of a directory', () => {
    expect(nodeAllowlistFileSystem.realDirectory(path.join(base, 'projects'))).toBe(
      path.join(base, 'projects'),
    );
  });

  it('resolves a root that is itself a symlink', () => {
    // Resolving only the candidates and not the root would make such a root contain nothing:
    // every comparison would be a resolved path against an unresolved one.
    expect(nodeAllowlistFileSystem.realDirectory(path.join(base, 'link'))).toBe(
      path.join(base, 'projects'),
    );
  });

  it.each([
    ['a path that is not there', 'gone'],
    ['a file', 'notes.md'],
    ['a dangling link', 'dangling'],
  ])('answers null for %s', (_case, name) => {
    expect(nodeAllowlistFileSystem.realDirectory(path.join(base, name))).toBeNull();
  });
});
