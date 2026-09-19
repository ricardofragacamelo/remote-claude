import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadDotEnv, repositoryDotEnv } from '../../src/bootstrap';

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

  it('says there was nothing to load rather than failing', () => {
    expect(loadDotEnv(path.join(directory, 'absent'))).toBe(false);
  });

  it('points at the repository root by default', () => {
    // From `src/`, two levels up: a path computed from `import.meta.url` rather than from the
    // working directory, because the process is started from the package and from the repository.
    expect(repositoryDotEnv().endsWith(path.join('remote-claude', '.env'))).toBe(true);
  });
});
