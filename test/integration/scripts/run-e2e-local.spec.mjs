import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { run, runAsync } from '../../../scripts/lib/exec.mjs';
import { PROJECT_LABEL } from '../../../scripts/lib/compose.mjs';
import { E2E_PROJECT_PREFIX, PORT_VARIABLES } from '../../../scripts/lib/stack.mjs';

/**
 * `pnpm test:e2e`, against real Docker — S-56 to S-59.
 *
 * The four promises of B-37 are all about what happens *around* the suite, and none of them can be
 * checked against a fake: that the ports are allocated rather than fixed, that the exit code is the
 * suite's, that the volumes and the generated `.env` are gone afterwards, and that a project a
 * killed run left behind is purged before anything starts.
 *
 * The run is deliberately steered at **one failing spec**, written here and deleted afterwards.
 * It is the only way to prove the exit code is not a fixed `0` — and it makes the run cheap, since
 * Playwright stops after one test. The passing direction is gate 9 itself: `pnpm test:e2e` exits 0
 * with the whole suite green, which is what `pnpm verify:full` depends on.
 *
 * Docker is a hard prerequisite of this repository (R-05), so a missing daemon fails rather than
 * skipping quietly.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Two images, a realm import, a web build and a browser.
vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

/** A spec that cannot pass, so the run has a red suite to report the exit code of. */
const brokenSpec = path.join(repoRoot, 'e2e/specs/deliberately-broken.spec.ts');

const BROKEN_SPEC = [
  "import { expect, test } from '@playwright/test';",
  '',
  '// Written by test/integration/scripts/run-e2e-local.spec.mjs and deleted by it. Seeing it in',
  '// a diff means that run was killed halfway through: the file is disposable.',
  "test('deliberately broken, so the run has a red suite to report', () => {",
  '  expect(1).toBe(2);',
  '});',
  '',
].join('\n');

/** A named volume labelled as a project of an earlier run, with no container left to own it. */
const staleProject = `${E2E_PROJECT_PREFIX}stale-${String(process.pid)}`;
const staleVolume = `${staleProject}_postgres-data`;

/** @param {string[]} args @returns {string[]} */
function dockerLines(args) {
  return run('docker', args, { timeoutMs: 60_000 })
    .stdout.split('\n')
    .map((row) => row.trim())
    .filter((row) => row !== '');
}

/** Every volume Compose labelled as belonging to a project under the e2e prefix. */
function e2eVolumes() {
  return dockerLines([
    'volume',
    'ls',
    '--filter',
    `label=${PROJECT_LABEL}`,
    '--format',
    `{{.Label "${PROJECT_LABEL}"}}\t{{.Name}}`,
  ]).filter((row) => row.startsWith(E2E_PROJECT_PREFIX));
}

/** Every container of a project under the e2e prefix, running or not. */
function e2eContainers() {
  return dockerLines([
    'ps',
    '--all',
    '--filter',
    `label=${PROJECT_LABEL}`,
    '--format',
    `{{.Label "${PROJECT_LABEL}"}}`,
  ]).filter((name) => name.startsWith(E2E_PROJECT_PREFIX));
}

/** The bundles of limits webs on this machine — each run builds one in the temporary folder. */
function limitsBundles() {
  return fs
    .readdirSync(os.tmpdir())
    .filter((entry) => entry.startsWith('remote-claude-web-limits-'));
}

describe('run-e2e-local.mjs, against real docker', () => {
  /** @type {import('../../../scripts/lib/exec.mjs').RunResult} */
  let result;
  /** Whatever other runs on this machine left, which is not this run's to answer for. */
  const bundlesBefore = limitsBundles();
  /** @type {net.Server[]} */
  const squatters = [];

  beforeAll(async () => {
    fs.writeFileSync(brokenSpec, BROKEN_SPEC, 'utf8');

    // S-56: the fixed ports of `pnpm dev` are all taken, as they would be with a development stack
    // running in another terminal. An ephemeral run must not want a single one of them.
    for (const { fallback: port } of PORT_VARIABLES) {
      // Holding the port, not serving it: whatever connects — a `pnpm dev` of another suite probing
      // its health, say — is dropped at once. A connection left open here is one `close()` below
      // waits on for ever, and the suite then dies of its own teardown (plan 05, cycles 6 and 8).
      const server = net.createServer((socket) => {
        socket.destroy();
      });
      await new Promise((resolve) => {
        // A port already held by something else on this machine is the same situation, so a
        // failure to bind is not an error here — the point is that these ports are unavailable.
        server.once('error', () => resolve(undefined));
        server.listen({ port, host: '127.0.0.1' }, () => resolve(undefined));
      });
      squatters.push(server);
    }

    // S-59: what a run killed with SIGKILL leaves behind. The containers are gone, so `compose ls`
    // cannot see the project at all — only the label on the volume says it ever existed.
    run(
      'docker',
      ['volume', 'create', '--label', `${PROJECT_LABEL}=${staleProject}`, staleVolume],
      {
        timeoutMs: 60_000,
      },
    );

    // Asynchronously: the blocking form would hold this worker for the whole run, and vitest's
    // reporter gives up on a worker that stops answering long before an ephemeral stack is up.
    result = await runAsync(
      process.execPath,
      [path.join(repoRoot, 'scripts/run-e2e-local.mjs'), '--grep', 'deliberately broken'],
      { cwd: repoRoot, timeoutMs: 900_000, env: { ...process.env, NO_COLOR: '1' } },
    );
  });

  afterAll(async () => {
    fs.rmSync(brokenSpec, { force: true });
    run('docker', ['volume', 'rm', '--force', staleVolume], { timeoutMs: 60_000 });

    for (const server of squatters) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('brings the whole stack up before any of the rest means anything', () => {
    // Without this the three assertions below all pass on a run that never got past `compose up`:
    // the project line, the purge line and "nothing left" are all true of a stack that never
    // existed. This is the line that says the suite really had a system to talk to.
    expect(result.stdout, result.stdout).toContain('✓ postgres');
    expect(result.stdout, result.stdout).toContain('✓ keycloak');
    expect(result.stdout, result.stdout).toContain('✓ backend');
    expect(result.stdout, result.stdout).toContain('✓ web');
  });

  it('S-83 — brings the limits stack up beside the main one, and takes it down with it', () => {
    expect(result.stdout, result.stdout).toContain('✓ limits backend');
    expect(result.stdout, result.stdout).toContain('✓ limits web');

    // Its bundle is built outside the repository, and gone when the run is.
    expect(limitsBundles().filter((dir) => !bundlesBefore.includes(dir))).toEqual([]);
  });

  it('S-57 — exits with the code of the suite, not with a fixed 0', () => {
    // Playwright ran, and reported the one test it was pointed at as failed. The exit code is
    // therefore the **suite's**, not an accident of the stack failing to come up.
    expect(result.stdout, result.stdout).toContain('deliberately broken');
    expect(result.stdout).toMatch(/1 failed/);

    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain('e2e failed with exit');
  });

  it('S-56 — allocates its own ports and its own project, colliding with no development stack', () => {
    expect(/project: remote-claude-e2e-\d+/.test(result.stdout), result.stdout).toBe(true);

    // Not one of the four fixed ports appears in the board it printed: they are all taken, and the
    // run came up anyway. That is the whole of "runs with `pnpm dev` up".
    for (const { key, fallback } of PORT_VARIABLES) {
      expect(result.stdout, `${key} must not be on its fixed port`).not.toContain(
        `localhost:${String(fallback)}`,
      );
    }
  });

  it('S-58 — leaves no container, no volume, no e2e/.env and no backend log behind', () => {
    expect(e2eContainers()).toEqual([]);
    expect(e2eVolumes()).toEqual([]);
    expect(fs.existsSync(path.join(repoRoot, 'e2e/.env'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'e2e/.backend.log'))).toBe(false);
  });

  it('S-59 — purges the orphan volume of a project no `compose ls` can see', () => {
    expect(result.stdout).toMatch(/purged \d+ stale project\(s\) and \d+ orphan volume\(s\)/);
    expect(dockerLines(['volume', 'ls', '--format', '{{.Name}}'])).not.toContain(staleVolume);
  });
});

describe('run-e2e-local.mjs --mobile, on a machine with no Android SDK', () => {
  /** @type {import('../../../scripts/lib/exec.mjs').RunResult} */
  let result;
  /** @type {string} */
  let emptySdk;

  beforeAll(async () => {
    emptySdk = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-no-sdk-'));

    result = await runAsync(
      process.execPath,
      [path.join(repoRoot, 'scripts/run-e2e-local.mjs'), '--mobile'],
      {
        cwd: repoRoot,
        timeoutMs: 120_000,
        env: { ...process.env, NO_COLOR: '1', ANDROID_HOME: emptySdk },
      },
    );
  });

  afterAll(() => {
    fs.rmSync(emptySdk, { recursive: true, force: true });
  });

  it('fails before a single container exists, saying where it looked', () => {
    expect(result.code, result.stdout).not.toBe(0);
    expect(result.stdout).toContain('adb is not installed — set ANDROID_HOME to the Android SDK');
    expect(result.stdout).toContain(`looked for the SDK in ${emptySdk}`);
    expect(result.stdout).not.toContain('project: ');
  });

  it('starts no emulator, and stops no Gradle it never started', () => {
    expect(result.stdout).not.toContain('starting the emulator');
    expect(result.stdout).not.toContain('emulator down');
    expect(result.stdout).not.toContain('Gradle daemons stopped');
    expect(fs.existsSync(path.join(repoRoot, 'e2e/.env'))).toBe(false);
  });
});
