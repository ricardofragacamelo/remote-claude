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
