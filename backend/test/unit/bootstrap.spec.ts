import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  forgetEmptyClaudeConfigDir,
  loadDotEnv,
  repositoryDotEnv,
  SHUTDOWN_SIGNALS,
} from '../../src/bootstrap';

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
    expect(repositoryDotEnv().endsWith(path.join('remote-claude', '.env'))).toBe(true);
  });
});

describe('forgetEmptyClaudeConfigDir', () => {
  it('drops a value that is only blank, exported or loaded alike', () => {
    const env: NodeJS.ProcessEnv = { CLAUDE_CONFIG_DIR: '  ', OTHER: '' };

    forgetEmptyClaudeConfigDir(env);

    expect(env).toEqual({ OTHER: '' });
  });

  it('keeps a directory that was really chosen', () => {
    const env: NodeJS.ProcessEnv = { CLAUDE_CONFIG_DIR: '/srv/claude' };

    forgetEmptyClaudeConfigDir(env);

    expect(env).toEqual({ CLAUDE_CONFIG_DIR: '/srv/claude' });
  });

  it('leaves an environment without it as it was', () => {
    const env: NodeJS.ProcessEnv = {};

    forgetEmptyClaudeConfigDir(env);

    expect(env).toEqual({});
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
