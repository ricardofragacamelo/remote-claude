import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  STACK_TIMEOUT_MS,
  bringUp,
  composeRunner,
  serviceStatuses,
  stillPending,
} from '../../../scripts/lib/local-stack.mjs';

/**
 * The half `start-local` and `run-e2e-local` share.
 *
 * Everything here is driven through a stand-in for `compose`, because what is being checked is the
 * *decision* — which arguments go out, and when the wait is over — and not whether Docker works.
 * That the containers really come up is the integration suite's business.
 */

/** Every call `composeRunner` made through `exec.mjs`, in order. */
const invoked = vi.hoisted(() => /** @type {Record<string, unknown>[]} */ ([]));

// The one module this file stands in for: what is under test is which command line goes out, and
// spawning a real `docker` to find that out would be an integration test.
vi.mock('../../../scripts/lib/exec.mjs', () => ({
  /** @type {import('../../../scripts/lib/exec.mjs').run} */
  run: (command, args, options = {}) => {
    invoked.push({ mode: 'captured', command, args: [...args], ...options, timeoutMs: undefined });
    return { found: true, code: 0, stdout: '', stderr: '' };
  },
  /** @type {import('../../../scripts/lib/exec.mjs').runAttached} */
  runAttached: (command, args, options = {}) => {
    invoked.push({ mode: 'attached', command, args: [...args], ...options, timeoutMs: undefined });
    return { found: true, code: 0, stdout: '', stderr: '' };
  },
}));

/**
 * A compose that answers a scripted `ps`, and records every call.
 *
 * @param {readonly (readonly Record<string, string>[])[]} statuses one `ps` answer per call, the
 *   last one repeating for ever
 * @returns {{ compose: import('../../../scripts/lib/local-stack.mjs').Compose,
 *             calls: { args: string[], attached: boolean }[] }}
 */
function fakeCompose(statuses) {
  /** @type {{ args: string[], attached: boolean }[]} */
  const calls = [];
  const remaining = [...statuses];

  /** @type {import('../../../scripts/lib/local-stack.mjs').Compose} */
  const compose = (args, options = {}) => {
    calls.push({ args: [...args], attached: options.attached === true });

    if (args[0] === 'ps') {
      const next = remaining.length > 1 ? remaining.shift() : remaining[0];
      return { found: true, code: 0, stdout: JSON.stringify(next ?? []), stderr: '' };
    }

    return { found: true, code: 0, stdout: '', stderr: '' };
  };

  return { compose, calls };
}

const running = [
  { Service: 'postgres', State: 'running', Health: 'healthy' },
  { Service: 'keycloak', State: 'running', Health: 'healthy' },
];

describe('composeRunner', () => {
  const cli = { command: 'docker', args: ['compose'] };

  beforeEach(() => {
    invoked.length = 0;
  });

  it('puts the project name on every call, so no run ever touches another project', () => {
    composeRunner(cli, 'remote-claude-e2e-42', { cwd: '/repo' })(['ps']);

    expect(invoked[0]).toEqual({
      mode: 'captured',
      command: 'docker',
      args: ['compose', '--project-name', 'remote-claude-e2e-42', 'ps'],
      cwd: '/repo',
    });
  });

  it('attaches the terminal only when the caller asked for it', () => {
    const compose = composeRunner(cli, 'p', { cwd: '/repo' });

    compose(['up'], { attached: true });
    compose(['ps']);

    expect(invoked.map((call) => call.mode)).toEqual(['attached', 'captured']);
  });

  it('hands the ephemeral environment to compose, so the ports are the allocated ones', () => {
    composeRunner(cli, 'p', { cwd: '/repo', env: { RC_WEB_PORT: '51004' } })(['up']);

    expect(invoked[0]?.env).toEqual({ RC_WEB_PORT: '51004' });
  });

  it('answers "not found" instead of throwing when compose is not installed', () => {
    const result = composeRunner(null, 'anything', { cwd: '/repo' })(['ps']);

    expect(result.found).toBe(false);
    expect(result.code).toBe(127);
  });
});

describe('serviceStatuses and stillPending', () => {
  it('reads what compose reports about each service', () => {
    const { compose } = fakeCompose([running]);

    expect(serviceStatuses(compose)).toEqual([
      { service: 'postgres', state: 'running', health: 'healthy' },
      { service: 'keycloak', state: 'running', health: 'healthy' },
    ]);
  });

  it('names the services that are not up, which is what an error message needs', () => {
    const { compose } = fakeCompose([
      [{ Service: 'postgres', State: 'running', Health: 'healthy' }],
    ]);

    expect(stillPending(compose)).toEqual(['keycloak']);
  });

  it('answers every service when compose reports nothing at all', () => {
    const { compose } = fakeCompose([[]]);

    expect(stillPending(compose)).toEqual(['postgres', 'keycloak']);
  });
});

describe('bringUp', () => {
  const urls = {
    postgres: 'localhost:1',
    realm: 'http://localhost:1/realms/remote-claude',
    discovery: 'http://localhost:1/realms/remote-claude/.well-known/openid-configuration',
  };

  it('brings the containers up detached, removing what an earlier shape left behind', async () => {
    const { compose, calls } = fakeCompose([running]);
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 200 })));

    await bringUp(compose, urls);

    expect(calls[0]).toEqual({ args: ['up', '--detach', '--remove-orphans'], attached: true });
    vi.unstubAllGlobals();
  });

  it('waits for the realm to answer, not merely for the container to be healthy', async () => {
    const { compose } = fakeCompose([running]);
    let attempts = 0;

    // Keycloak reports healthy before it has imported the realm. A wait that stopped at the
    // container would hand the suite a provider with no clients in it.
    vi.stubGlobal('fetch', () => {
      attempts += 1;
      return attempts < 3
        ? Promise.reject(new Error('connection refused'))
        : Promise.resolve(new Response('{}', { status: 200 }));
    });

    await bringUp(compose, urls, { timeoutMs: 10_000 });

    expect(attempts).toBe(3);
    vi.unstubAllGlobals();
  });

  it('fails loudly when compose itself refuses, instead of waiting out the timeout', async () => {
    const compose = () => ({ found: true, code: 17, stdout: '', stderr: 'no such image' });

    await expect(bringUp(compose, urls)).rejects.toThrow(/compose up failed with exit 17/);
  });

  it('gives the stack three minutes, which is a cold `docker pull` of two images', () => {
    expect(STACK_TIMEOUT_MS).toBe(180_000);
  });
});
