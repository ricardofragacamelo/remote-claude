import { describe, expect, it } from 'vitest';

import {
  exitCodeFor,
  FIXED_PORTS,
  inspectEnvironment,
} from '../../../scripts/lib/prerequisites.mjs';
import { meetsMinimum, parseVersion } from '../../../scripts/lib/version.mjs';

/**
 * @param {Record<string, import('../../../scripts/lib/exec.mjs').RunResult>} [overrides]
 * @returns {import('../../../scripts/lib/prerequisites.mjs').Probes}
 */
function probesWith(overrides = {}) {
  /** @type {Record<string, { found: boolean, code: number, stdout: string, stderr: string }>} */
  const answers = {
    pnpm: { found: true, code: 0, stdout: '10.18.0\n', stderr: '' },
    'docker info': { found: true, code: 0, stdout: '29.1.3\n', stderr: '' },
    'docker compose': {
      found: true,
      code: 0,
      stdout: 'Docker Compose version v2.30.0\n',
      stderr: '',
    },
    flutter: { found: true, code: 0, stdout: 'Flutter 3.44.4 • channel stable\n', stderr: '' },
    gitleaks: { found: true, code: 0, stdout: 'v8.18.4\n', stderr: '' },
    ...overrides,
  };

  return {
    nodeVersion: 'v22.16.0',
    run: (command, args) => {
      const key =
        command === 'docker' ? `docker ${args[0] === 'info' ? 'info' : 'compose'}` : command;
      return answers[key] ?? { found: false, code: 127, stdout: '', stderr: 'not found' };
    },
    isPortFree: () => Promise.resolve(true),
  };
}

/**
 * @param {readonly import('../../../scripts/lib/prerequisites.mjs').CheckResult[]} results
 * @param {string} name
 */
function check(results, name) {
  return results.find((result) => result.name === name);
}

describe('inspectEnvironment', () => {
  it('passes when everything is installed and every port is free', async () => {
    const results = await inspectEnvironment(probesWith());

    expect(results.filter((result) => result.status !== 'ok')).toEqual([]);
    expect(exitCodeFor(results)).toBe(0);
  });

  it('fails on a node older than the minimum, saying how to solve it', async () => {
    const probes = { ...probesWith(), nodeVersion: 'v20.11.0' };

    const node = check(await inspectEnvironment(probes), 'node');

    expect(node?.status).toBe('fail');
    expect(node?.detail).toContain('below the required 22');
    expect(node?.fix).toContain('nvm install 22');
  });

  it('accepts the exact minimum version', async () => {
    const probes = { ...probesWith(), nodeVersion: 'v22.0.0' };

    expect(check(await inspectEnvironment(probes), 'node')?.status).toBe('ok');
  });

  it('fails when a required tool is not on PATH', async () => {
    const probes = probesWith({ pnpm: { found: false, code: 127, stdout: '', stderr: '' } });

    const pnpm = check(await inspectEnvironment(probes), 'pnpm');

    expect(pnpm?.status).toBe('fail');
    expect(pnpm?.detail).toBe('not found on PATH');
    expect(pnpm?.fix).toContain('corepack');
  });

  it('separates docker installed from docker running', async () => {
    const probes = probesWith({
      'docker info': { found: true, code: 1, stdout: '', stderr: 'cannot connect' },
    });

    const docker = check(await inspectEnvironment(probes), 'docker');

    expect(docker?.status).toBe('fail');
    expect(docker?.detail).toContain('daemon does not answer');
  });

  it('only warns about flutter and gitleaks, which block nothing by themselves', async () => {
    const probes = probesWith({
      flutter: { found: false, code: 127, stdout: '', stderr: '' },
      gitleaks: { found: false, code: 127, stdout: '', stderr: '' },
    });

    const results = await inspectEnvironment(probes);

    expect(check(results, 'flutter')?.status).toBe('warn');
    expect(check(results, 'gitleaks')?.status).toBe('warn');
    expect(exitCodeFor(results)).toBe(0);
  });

  it('warns about a taken port and names the variable that moves it', async () => {
    const probes = { ...probesWith(), isPortFree: () => Promise.resolve(false) };

    const port = check(await inspectEnvironment(probes), 'port 5432');

    expect(port?.status).toBe('warn');
    expect(port?.fix).toContain('RC_POSTGRES_PORT');
  });

  it('checks exactly the fixed ports of the development stack', async () => {
    const names = (await inspectEnvironment(probesWith()))
      .filter((result) => result.name.startsWith('port '))
      .map((result) => result.name);

    expect(names).toEqual(FIXED_PORTS.map(({ port }) => `port ${port}`));
  });
});

describe('exitCodeFor', () => {
  it('fails on any failure', () => {
    expect(exitCodeFor([{ name: 'x', status: 'fail', detail: '' }])).toBe(1);
  });

  it('lets a warning pass, unless strict was asked for', () => {
    const results = [{ name: 'x', status: /** @type {const} */ ('warn'), detail: '' }];

    expect(exitCodeFor(results)).toBe(0);
    expect(exitCodeFor(results, { strict: true })).toBe(1);
  });
});

describe('version', () => {
  it('parses the first x.y.z of whatever the tool printed', () => {
    expect(parseVersion('v22.16.0')).toEqual([22, 16, 0]);
    expect(parseVersion('Docker version 29.1.3, build 29.1.3-0ubuntu3')).toEqual([29, 1, 3]);
    expect(parseVersion('Flutter 3.44.4 • channel stable')).toEqual([3, 44, 4]);
  });

  it('treats a missing patch as zero', () => {
    expect(parseVersion('10.18')).toEqual([10, 18, 0]);
  });

  it('answers null when there is no version at all', () => {
    expect(parseVersion('command not found')).toBeNull();
    expect(meetsMinimum('command not found', '9')).toBe(false);
  });

  it('compares numerically, not as text', () => {
    expect(meetsMinimum('9.0.0', '10')).toBe(false);
    expect(meetsMinimum('10.0.0', '9')).toBe(true);
    expect(meetsMinimum('22.0.0', '22')).toBe(true);
    expect(meetsMinimum('21.99.99', '22')).toBe(false);
  });
});

describe('inspectEnvironment — the paths a broken machine takes', () => {
  it('fails a tool that is installed but answers with an error', async () => {
    const results = await inspectEnvironment(
      probesWith({ pnpm: { found: true, code: 1, stdout: '', stderr: 'corepack is confused' } }),
    );

    expect(check(results, 'pnpm')).toMatchObject({ status: 'fail', detail: 'exited with 1' });
  });

  it('fails when docker is not installed at all, and says why it is not optional', async () => {
    const results = await inspectEnvironment(
      probesWith({ 'docker info': { found: false, code: 127, stdout: '', stderr: '' } }),
    );

    expect(check(results, 'docker')).toMatchObject({ status: 'fail', detail: 'not found on PATH' });
    expect(check(results, 'docker')?.fix).toContain('testcontainers');
  });

  it('fails when neither shape of Compose answers', async () => {
    const results = await inspectEnvironment(
      probesWith({ 'docker compose': { found: false, code: 127, stdout: '', stderr: '' } }),
    );

    expect(check(results, 'docker compose')).toMatchObject({ status: 'fail' });
    expect(check(results, 'docker compose')?.fix).toContain('docker-compose');
  });

  it('reports the version Compose gave, whichever shape answered', async () => {
    const results = await inspectEnvironment(probesWith());

    expect(check(results, 'docker compose')?.detail).toContain('Docker Compose version');
  });

  it('warns when flutter answers with an error rather than failing the machine', async () => {
    const results = await inspectEnvironment(
      probesWith({ flutter: { found: true, code: 2, stdout: '', stderr: 'broken install' } }),
    );

    expect(check(results, 'flutter')?.status).toBe('warn');
  });
});
