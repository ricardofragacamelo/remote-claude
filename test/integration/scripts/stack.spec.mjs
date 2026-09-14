import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  composeArgv,
  purgeStaleProjects,
  resolveComposeCli,
} from '../../../scripts/lib/compose.mjs';
import { run } from '../../../scripts/lib/exec.mjs';
import { kill, startProc } from '../../../scripts/lib/proc.mjs';
import { findFreePort } from '../../../scripts/lib/ports.mjs';
import { waitUntil } from '../../../scripts/lib/wait.mjs';

/**
 * `pnpm dev`, against real Docker.
 *
 * This is the only place the promises of F1 can actually be checked: that the stack comes up and
 * prints where it is, that Ctrl+C leaves no container running, and that it leaves the volumes
 * alone. None of it is provable against a fake — the whole point is the behaviour of compose.
 *
 * Docker is a hard prerequisite of this repository (R-05 in the bootstrap plan), so a missing
 * daemon fails the suite rather than skipping it quietly.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Pulling two images on a cold machine, then waiting for Keycloak to import a realm.
vi.setConfig({ testTimeout: 420_000, hookTimeout: 420_000 });

/** Its own compose project, so the run never touches a development stack someone has up. */
const project = `remote-claude-spec-${String(process.pid)}`;

const cli = resolveComposeCli((command, args) => run(command, args, { timeoutMs: 20_000 }));

/**
 * @param {readonly string[]} args
 * @returns {import('../../../scripts/lib/exec.mjs').RunResult}
 */
function compose(args) {
  if (cli === null) {
    throw new Error('docker compose is required for the integration suite');
  }

  const argv = composeArgv(cli, project, args);
  return run(argv.command, argv.args, { cwd: repoRoot, timeoutMs: 300_000 });
}

/** @returns {string[]} names of the project's containers, running ones only */
function runningContainers() {
  return compose(['ps', '--quiet'])
    .stdout.split('\n')
    .filter((id) => id.trim() !== '');
}

/** @returns {string[]} names of the project's named volumes */
function volumes() {
  return run('docker', [
    'volume',
    'ls',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.Name}}',
  ])
    .stdout.split('\n')
    .filter((name) => name.trim() !== '')
    .sort();
}

describe('start-local.mjs, against real docker', () => {
  /** @type {import('node:child_process').ChildProcess} */
  let dev;
  /** @type {string} */
  let output = '';
  /** @type {Record<string, string>} */
  let env = {};

  beforeAll(async () => {
    expect(cli, 'docker compose must be installed to run the integration suite').not.toBeNull();

    const [postgres, keycloak] = await Promise.all([findFreePort(), findFreePort()]);
    env = {
      COMPOSE_PROJECT_NAME: project,
      RC_POSTGRES_PORT: String(postgres),
      RC_KEYCLOAK_PORT: String(keycloak),
    };

    dev = startProc(process.execPath, [path.join(repoRoot, 'scripts/start-local.mjs')], {
      cwd: repoRoot,
      env: { ...process.env, ...env, NO_COLOR: '1' },
      // The output is the assertion subject here, so it is piped rather than inherited.
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    dev.stdout?.setEncoding('utf8');
    dev.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });

    await waitUntil({
      target: 'the URL board of start-local',
      timeoutMs: 400_000,
      intervalMs: 1_000,
      abortIf: () => (dev.exitCode === null ? null : `exited with ${String(dev.exitCode)}`),
      probe: () => Promise.resolve(output.includes('Ctrl+C stops')),
    });
  });

  afterAll(async () => {
    if (dev !== undefined) {
      await kill(dev, { graceMs: 30_000 });
    }
    compose(['down', '--volumes', '--remove-orphans']);
  });

  it('brings both services up and prints where each one answers', () => {
    expect(runningContainers()).toHaveLength(2);
    expect(output).toContain(`localhost:${String(env['RC_POSTGRES_PORT'])}`);
    expect(output).toContain(`http://localhost:${String(env['RC_KEYCLOAK_PORT'])}`);
  });

  it('waits for the realm, not merely for the container — the discovery document answers', async () => {
    const response = await fetch(
      `http://localhost:${String(env['RC_KEYCLOAK_PORT'])}/realms/remote-claude/.well-known/openid-configuration`,
    );

    expect(response.status).toBe(200);
    const discovery = /** @type {{ issuer: string }} */ (await response.json());
    expect(discovery.issuer).toContain('/realms/remote-claude');
  });

  it('says which halves of the stack do not exist yet, instead of failing on them', () => {
    // backend/ and web/ arrive in F3 and F4; until then `pnpm dev` still has a job to do.
    expect(output).toMatch(/backend — (not created yet|watch)/);
    expect(output).toMatch(/web — (not created yet|watch)/);
  });

  it('leaves no container running after Ctrl+C, and keeps the volumes', async () => {
    const before = volumes();
    expect(before.length).toBeGreaterThan(0);

    dev.kill('SIGINT');
    await waitUntil({
      target: 'start-local to exit',
      timeoutMs: 120_000,
      intervalMs: 500,
      probe: () => Promise.resolve(dev.exitCode !== null || dev.signalCode !== null),
    });

    expect(output).toContain('stopped');
    expect(runningContainers()).toEqual([]);
    // `stop`, not `down`: losing the local database at every Ctrl+C is daily friction.
    expect(volumes()).toEqual(before);
  });
});

describe('start-local.mjs, when a service cannot come up', () => {
  /** Its own project, so the failed run cannot disturb the one above. */
  const blocked = `remote-claude-blocked-${String(process.pid)}`;

  /** @type {net.Server} */
  let squatter;
  /** @type {import('../../../scripts/lib/exec.mjs').RunResult} */
  let result;

  beforeAll(async () => {
    const [taken, free] = await Promise.all([findFreePort(), findFreePort()]);

    // Something else already holds the port compose is about to publish. This is the everyday
    // shape of "a service does not come up", and the script has to say so and clean up rather
    // than hang or leave half a stack behind.
    squatter = net.createServer();
    await new Promise((resolve) => {
      squatter.listen({ port: taken, host: '0.0.0.0' }, () => {
        resolve(undefined);
      });
    });

    result = run(process.execPath, [path.join(repoRoot, 'scripts/start-local.mjs')], {
      cwd: repoRoot,
      timeoutMs: 300_000,
      env: {
        ...process.env,
        NO_COLOR: '1',
        COMPOSE_PROJECT_NAME: blocked,
        RC_POSTGRES_PORT: String(taken),
        RC_KEYCLOAK_PORT: String(free),
      },
    });
  });

  afterAll(async () => {
    if (cli !== null) {
      const argv = composeArgv(cli, blocked, ['down', '--volumes', '--remove-orphans']);
      run(argv.command, argv.args, { cwd: repoRoot, timeoutMs: 300_000 });
    }
    await new Promise((resolve) => squatter.close(resolve));
  });

  it('exits non-zero instead of pretending it came up', () => {
    expect(result.code).toBe(1);
  });

  it('says what failed, and where to look next', () => {
    expect(result.stdout).toContain('compose up failed');
    expect(result.stdout).toContain('pnpm doctor');
  });

  it('runs its cleanup on the way out', () => {
    expect(result.stdout).toContain('stopping');
  });

  it('leaves no container of the failed project running', () => {
    if (cli === null) {
      throw new Error('docker compose is required for the integration suite');
    }

    const argv = composeArgv(cli, blocked, ['ps', '--quiet']);
    const running = run(argv.command, argv.args, { cwd: repoRoot, timeoutMs: 60_000 });

    expect(running.stdout.trim()).toBe('');
  });
});

describe('purgeStaleProjects, against real docker', () => {
  /** Its own prefix, so the purge under test can never reach another suite's project. */
  const prefix = `remote-claude-orphan-${String(process.pid)}`;
  const volume = `${prefix}_postgres-data`;

  /** @type {import('../../../scripts/lib/compose.mjs').Runner} */
  const runner = (command, args) => run(command, args, { timeoutMs: 120_000 });

  beforeAll(() => {
    // A named volume labelled with a compose project that has no containers: exactly what a
    // SIGKILLed run leaves behind, and exactly what `compose ls` cannot show.
    run('docker', ['volume', 'create', '--label', `com.docker.compose.project=${prefix}`, volume]);
  });

  afterAll(() => {
    run('docker', ['volume', 'rm', '--force', volume]);
  });

  it('the leftover really is invisible to compose ls', () => {
    if (cli === null) {
      throw new Error('docker compose is required for the integration suite');
    }

    const listed = run(cli.command, [...cli.args, 'ls', '--all'], { timeoutMs: 60_000 });

    expect(listed.stdout).not.toContain(prefix);
  });

  it('removes it anyway, and says which volume it removed', () => {
    if (cli === null) {
      throw new Error('docker compose is required for the integration suite');
    }

    const report = purgeStaleProjects(runner, cli, { prefix });

    expect(report.volumes).toEqual([volume]);
    expect(report.failures).toEqual([]);
    expect(run('docker', ['volume', 'inspect', volume]).code).not.toBe(0);
  });

  it('is idempotent — running it again over the cleaned state removes nothing', () => {
    if (cli === null) {
      throw new Error('docker compose is required for the integration suite');
    }

    expect(purgeStaleProjects(runner, cli, { prefix })).toEqual({
      projects: [],
      volumes: [],
      failures: [],
    });
  });
});
