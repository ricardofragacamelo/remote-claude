import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDotEnv, repositoryDotEnv, SHUTDOWN_SIGNALS } from '../../src/bootstrap';

/**
 * The repository root, computed independently of `repositoryDotEnv()` — from this file's own
 * location (`test/unit/`, three levels below the root) rather than from a folder name. A checkout
 * and a worktree never share a directory name, and a test that assumed one would be the only place
 * that cared what the checkout was called.
 */
function repositoryRootFromThisFile(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

/**
 * The `.env` the product loads when nobody exported it.
 *
 * `pnpm dev` exports the file already; running `pnpm --filter backend dev` on its own does not,
 * and a backend that refuses to start because nobody sourced a file is friction with no upside.
 */
describe('loadDotEnv', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'rc-dotenv-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    delete process.env['RC_DOTENV_PROBE'];
  });

  it('loads the file it was given', () => {
    const file = path.join(directory, '.env');
    writeFileSync(file, 'RC_DOTENV_PROBE=loaded\n', 'utf8');

    expect(loadDotEnv(file)).toBe(true);
    expect(process.env['RC_DOTENV_PROBE']).toBe('loaded');
  });

  it('never hands the CLI an empty CLAUDE_CONFIG_DIR, which it would take for a directory', () => {
    const file = path.join(directory, '.env');
    const before = process.env['CLAUDE_CONFIG_DIR'];
    delete process.env['CLAUDE_CONFIG_DIR'];
    writeFileSync(file, 'CLAUDE_CONFIG_DIR=\n', 'utf8');

    try {
      expect(loadDotEnv(file)).toBe(true);
      expect('CLAUDE_CONFIG_DIR' in process.env).toBe(false);
    } finally {
      if (before !== undefined) {
        process.env['CLAUDE_CONFIG_DIR'] = before;
      }
    }
  });

  it('says there was nothing to load rather than failing', () => {
    expect(loadDotEnv(path.join(directory, 'absent'))).toBe(false);
  });

  it('points at the repository root by default', () => {
    // From `src/`, two levels up: a path computed from `import.meta.url` rather than from the
    // working directory, because the process is started from the package and from the repository.
    // Compared against this file's own, independently computed root rather than a literal folder
    // name — a worktree is never called `remote-claude` (S-11, mirrored from `main`).
    expect(repositoryDotEnv()).toBe(path.join(repositoryRootFromThisFile(), '.env'));
  });
});

describe('SHUTDOWN_SIGNALS — plan 06, S-180', () => {
  it('shuts down on a termination and an interrupt', () => {
    expect(SHUTDOWN_SIGNALS).toEqual(expect.arrayContaining(['SIGTERM', 'SIGINT']));
  });

  it('never on SIGHUP, which reloads the allowlist', () => {
    expect(SHUTDOWN_SIGNALS).not.toContain('SIGHUP');
  });
});
