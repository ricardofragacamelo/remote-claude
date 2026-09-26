import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { run } from '../../../scripts/lib/exec.mjs';

// These spawn real processes that probe the docker daemon; the default 5 s is a unit-test
// budget, not an integration one.
vi.setConfig({ testTimeout: 60_000 });

/**
 * The scripts as the terminal sees them: what they print, and what they exit with.
 *
 * Every script of this repository owes an honest exit code — 0 only when it passed — and output
 * saying what failed and where (docs/plans/00-bootstrap/README.md#catálogo-de-scripts). That is
 * a contract of the process, not of a function, so it is checked by running them.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * @param {string} script file name inside `scripts/`
 * @param {readonly string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
function runScript(script, args = [], env) {
  return run(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
    cwd: repoRoot,
    timeoutMs: 120_000,
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
}

describe('doctor.mjs', () => {
  it('checks every required tool, whatever this machine happens to have', () => {
    const result = runScript('doctor.mjs');

    for (const tool of ['node', 'pnpm', 'docker', 'docker compose', 'port 5432']) {
      expect(result.stdout).toContain(tool);
    }
  });

  it('exits non-zero exactly when it reported a missing prerequisite', () => {
    const result = runScript('doctor.mjs');
    const reportedFailure = result.stdout.includes('prerequisite(s) missing');

    expect(result.code).toBe(reportedFailure ? 1 : 0);
  });

  it('fails, and says how to solve it, when the tools are not reachable', () => {
    const result = runScript('doctor.mjs', [], { PATH: path.join(repoRoot, 'no-such-directory') });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('not found on PATH');
    expect(result.stdout).toContain('corepack');
    expect(result.stdout).toContain('prerequisite(s) missing');
  });

  it('turns warnings into a failure under --strict', () => {
    const relaxed = runScript('doctor.mjs');
    const strict = runScript('doctor.mjs', ['--strict']);

    // The machine running this may legitimately have every warning clear; in that case both
    // runs pass, and what matters is that --strict is never more permissive than the default.
    expect(strict.code).toBeGreaterThanOrEqual(relaxed.code);
  });
});

describe('docs-check.mjs', () => {
  it('passes over the documentation of this repository', () => {
    const result = runScript('docs-check.mjs');

    expect(result.stdout).toContain('documentation graph is whole');
    expect(result.code).toBe(0);
  });
});

describe('plan.mjs', () => {
  it('refuses an unknown command, and shows the ones it has', () => {
    const result = runScript('plan.mjs', ['frobnicate']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('pnpm plan new');
    expect(result.stdout).toContain('pnpm plan progress');
  });

  it('refuses a plan name that is not kebab-case', () => {
    const result = runScript('plan.mjs', ['new', 'Not A Slug']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('kebab-case');
  });

  it('recalculates the counters of the bootstrap plan without changing anything else', () => {
    const first = runScript('plan.mjs', ['progress', '00-bootstrap']);
    const second = runScript('plan.mjs', ['progress', '00-bootstrap']);

    expect(first.code).toBe(0);
    expect(second.stdout).toBe(first.stdout);
  });
});

describe('clean.mjs', () => {
  it('previews without removing anything, and says so', () => {
    const result = runScript('clean.mjs', ['--dry-run']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('dry run');
  });

  it('never offers to remove the development stack', () => {
    const result = runScript('clean.mjs', ['--dry-run']);

    expect(result.stdout).toContain('never touched');
    expect(result.stdout).not.toContain('remote-claude_postgres-data');
  });

  it('leaves node_modules alone — the tree it runs against still has one afterwards', () => {
    const before = fs.existsSync(path.join(repoRoot, 'node_modules'));
    const result = runScript('clean.mjs', ['--dry-run']);

    expect(result.stdout).not.toContain('node_modules');
    expect(fs.existsSync(path.join(repoRoot, 'node_modules'))).toBe(before);
  });
});

describe('start-local.mjs', () => {
  it('fails, saying compose is missing, when docker is not reachable', () => {
    const result = runScript('start-local.mjs', [], {
      PATH: path.join(repoRoot, 'no-such-directory'),
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('docker compose is not available');
    expect(result.stdout).toContain('pnpm doctor');
  });

  it('refuses a port variable that is not a port, rather than binding the default', () => {
    const result = runScript('start-local.mjs', [], { RC_WEB_PORT: 'nope' });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('RC_WEB_PORT');
  });
});

describe('contracts.mjs', () => {
  it('reports both targets in sync with the committed schema', () => {
    const result = runScript('contracts.mjs', ['--check']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('TypeScript');
    expect(result.stdout).toContain('Dart');
    expect(result.stdout).toContain('in sync');
  });

  it('is idempotent — generating twice writes nothing the second time', () => {
    runScript('contracts.mjs');
    const second = runScript('contracts.mjs');

    expect(second.code).toBe(0);
    expect(second.stdout).toContain('unchanged');
    expect(second.stdout).not.toContain('written');
  });

  it('leaves the repository in sync after generating', () => {
    runScript('contracts.mjs');

    expect(runScript('contracts.mjs', ['--check']).code).toBe(0);
  });
});

describe('db.mjs', () => {
  it('lists every command, the purge among them, when asked for none', () => {
    const result = runScript('db.mjs');

    expect(result.code).toBe(2);
    for (const command of ['migrate', 'purge', 'reset', 'seed']) {
      expect(result.stdout).toContain(command);
    }
  });

  it('fails the purge, and says nothing was removed, when the database cannot be reached — S-91', () => {
    // Only what the command reads: it must not need the backend's whole environment to say this.
    const result = runScript('db.mjs', ['purge'], {
      DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      LOG_LEVEL: 'fatal',
      RC_AUDIT_RETENTION_DAYS: '90',
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('the purge could not start');
    expect(result.stdout).toContain('nothing was removed');
  });

  it('refuses a window below the floor before touching anything — S-33', () => {
    const result = runScript('db.mjs', ['purge'], {
      DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      LOG_LEVEL: 'fatal',
      RC_AUDIT_RETENTION_DAYS: '30',
    });

    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('without a report');
    expect(result.stderr).toContain('RC_AUDIT_RETENTION_DAYS');
  });
});
