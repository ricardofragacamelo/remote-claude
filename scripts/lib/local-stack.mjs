/**
 * Bringing the compose stack up, and taking it down.
 *
 * `start-local.mjs` and `run-e2e-local.mjs` are the same six steps with different answers to two
 * questions — which ports, and whether the volumes survive. Everything between those two answers
 * lives here, because two copies of "wait for Postgres, then wait for the realm" is exactly the
 * pair that drifts: one of them gets the fix for a slow machine and the other does not.
 *
 * See docs/plans/00-bootstrap/README.md#portas.
 */

import { allHealthy, composeArgv, parseComposePs, pendingServices } from './compose.mjs';
import { run, runAttached } from './exec.mjs';
import { SERVICES } from './stack.mjs';
import { ok } from './ui.mjs';
import { waitForHttp, waitUntil } from './wait.mjs';

/** Services get this long to report healthy before a script gives up and cleans up. */
export const STACK_TIMEOUT_MS = 180_000;

/**
 * @typedef {(args: readonly string[], options?: { attached?: boolean }) =>
 *   import('./exec.mjs').RunResult} Compose one compose call against one project
 */

/**
 * A compose caller bound to one project and one directory.
 *
 * A `null` CLI answers `found: false` instead of throwing: whether a missing compose is fatal is
 * the caller's decision, and `doctor` is what explains how to install it.
 *
 * @param {import('./compose.mjs').ComposeCli | null} cli
 * @param {string} project value of `--project-name`
 * @param {{ cwd: string, timeoutMs?: number, env?: NodeJS.ProcessEnv }} options
 * @returns {Compose}
 */
export function composeRunner(cli, project, options) {
  const timeoutMs = options.timeoutMs ?? STACK_TIMEOUT_MS;

  return (args, callOptions = {}) => {
    if (cli === null) {
      return { found: false, code: 127, stdout: '', stderr: 'no compose' };
    }

    const argv = composeArgv(cli, project, args);
    const invoke = callOptions.attached === true ? runAttached : run;

    return invoke(argv.command, argv.args, {
      cwd: options.cwd,
      timeoutMs,
      ...(options.env === undefined ? {} : { env: options.env }),
    });
  };
}

/**
 * What compose says about each service of the project.
 *
 * @param {Compose} compose
 * @returns {import('./compose.mjs').ServiceStatus[]}
 */
export function serviceStatuses(compose) {
  return parseComposePs(compose(['ps', '--all', '--format', 'json']).stdout);
}

/**
 * The services that are still not up, for an error message that names them.
 *
 * @param {Compose} compose
 * @returns {string[]}
 */
export function stillPending(compose) {
  return pendingServices(serviceStatuses(compose), SERVICES);
}

/**
 * Brings the containers up and waits until the stack can actually serve.
 *
 * **Healthy is not the same as ready to serve.** Keycloak answers `/health/ready` before it has
 * finished importing the realm, and the realm is what every client talks to — so the second wait
 * is on the discovery document, not on the container.
 *
 * It reports where each half answered as it goes: a stack that takes two minutes on a cold machine
 * has to say what it is doing, or the only honest reading of the silence is "it hung".
 *
 * @param {Compose} compose
 * @param {{ postgres: string, realm: string, discovery: string }} urls
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<void>}
 * @throws {import('./wait.mjs').WaitError} when the stack does not come up in time
 * @throws {Error} when `compose up` itself fails
 */
export async function bringUp(compose, urls, options = {}) {
  const timeoutMs = options.timeoutMs ?? STACK_TIMEOUT_MS;

  const up = compose(['up', '--detach', '--remove-orphans'], { attached: true });
  if (up.code !== 0) {
    throw new Error(`compose up failed with exit ${String(up.code)}`);
  }

  await waitUntil({
    target: `services ${SERVICES.join(', ')}`,
    timeoutMs,
    intervalMs: 1_000,
    probe: () => Promise.resolve(allHealthy(serviceStatuses(compose), SERVICES)),
  });
  ok('postgres', urls.postgres);

  await waitForHttp(urls.discovery, { timeoutMs, intervalMs: 1_000 });
  ok('keycloak', urls.realm);
}
