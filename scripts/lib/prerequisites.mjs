/**
 * The environment checks behind `pnpm doctor`.
 *
 * The probes are injected instead of imported so the suite can drive the whole matrix — missing
 * tool, version below the minimum, docker daemon down, port taken — without touching the
 * machine running the tests.
 */

import { resolveComposeCli } from './compose.mjs';
import { meetsMinimum } from './version.mjs';

/**
 * The fixed ports of the development stack, from docs/plans/00-bootstrap/README.md.
 * `run-e2e-local` allocates random ones, so only these are checked.
 */
export const FIXED_PORTS = [
  { port: 5432, service: 'PostgreSQL', variable: 'RC_POSTGRES_PORT' },
  { port: 8180, service: 'Keycloak', variable: 'RC_KEYCLOAK_PORT' },
  { port: 3000, service: 'Backend', variable: 'RC_BACKEND_PORT' },
  { port: 5173, service: 'Web', variable: 'RC_WEB_PORT' },
];

/**
 * @typedef {'ok' | 'warn' | 'fail'} CheckStatus
 */

/**
 * @typedef {object} CheckResult
 * @property {string} name
 * @property {CheckStatus} status
 * @property {string} detail what was found
 * @property {string} [fix] how to solve it — only when it is not `ok`
 */

/**
 * @typedef {object} Probes
 * @property {string} nodeVersion value of `process.version`
 * @property {(command: string, args: readonly string[]) => import('./exec.mjs').RunResult} run
 * @property {(port: number) => Promise<boolean>} isPortFree
 */

/**
 * A tool that must be present, at or above a minimum version.
 *
 * @param {Probes} probes
 * @param {{ name: string, command: string, args?: readonly string[], minimum?: string, install: string }} tool
 * @returns {CheckResult}
 */
function checkTool(probes, tool) {
  const result = probes.run(tool.command, tool.args ?? ['--version']);

  if (!result.found) {
    return {
      name: tool.name,
      status: 'fail',
      detail: 'not found on PATH',
      fix: tool.install,
    };
  }

  const output = `${result.stdout}${result.stderr}`.trim();

  if (result.code !== 0) {
    return {
      name: tool.name,
      status: 'fail',
      detail: `exited with ${result.code}`,
      fix: tool.install,
    };
  }

  if (tool.minimum !== undefined && !meetsMinimum(output, tool.minimum)) {
    return {
      name: tool.name,
      status: 'fail',
      detail: `${output.split('\n')[0] ?? output} is below the required ${tool.minimum}`,
      fix: tool.install,
    };
  }

  return { name: tool.name, status: 'ok', detail: output.split('\n')[0] ?? output };
}

/**
 * Runs every prerequisite check.
 *
 * @param {Probes} probes
 * @returns {Promise<CheckResult[]>}
 */
export async function inspectEnvironment(probes) {
  /** @type {CheckResult[]} */
  const results = [];

  results.push(
    meetsMinimum(probes.nodeVersion, '22')
      ? { name: 'node', status: 'ok', detail: probes.nodeVersion }
      : {
          name: 'node',
          status: 'fail',
          detail: `${probes.nodeVersion} is below the required 22`,
          fix: 'install Node 22 or newer (nvm install 22)',
        },
  );

  results.push(
    checkTool(probes, {
      name: 'pnpm',
      command: 'pnpm',
      minimum: '9',
      install: 'corepack enable && corepack prepare pnpm@latest --activate',
    }),
  );

  const docker = probes.run('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (!docker.found) {
    results.push({
      name: 'docker',
      status: 'fail',
      detail: 'not found on PATH',
      fix: 'install Docker — testcontainers and docker compose have no alternative here',
    });
  } else if (docker.code !== 0) {
    results.push({
      name: 'docker',
      status: 'fail',
      detail: 'installed, but the daemon does not answer',
      fix: 'start Docker (systemctl --user start docker, or open Docker Desktop)',
    });
  } else {
    results.push({ name: 'docker', status: 'ok', detail: `server ${docker.stdout.trim()}` });
  }

  // Compose v2 ships in two shapes — the `docker compose` plugin and the standalone
  // `docker-compose` binary — and they take the same arguments. Requiring the plugin
  // specifically would fail a machine that has a perfectly usable Compose.
  const compose = resolveComposeCli(probes.run);
  results.push(
    compose === null
      ? {
          name: 'docker compose',
          status: 'fail',
          detail: 'neither the compose plugin nor the docker-compose binary answers',
          fix: 'install the Docker Compose v2 plugin (docker-compose-plugin), or the docker-compose binary',
        }
      : {
          name: 'docker compose',
          status: 'ok',
          detail:
            probes
              .run(compose.command, [...compose.args, 'version'])
              .stdout.trim()
              .split('\n')[0] ?? `${compose.command} ${compose.args.join(' ')}`.trim(),
        },
  );

  const flutter = checkTool(probes, {
    name: 'flutter',
    command: 'flutter',
    install: 'install Flutter (stable channel) — only needed to work on mobile/',
  });
  results.push(
    flutter.status === 'ok' ? flutter : { ...flutter, status: 'warn', detail: 'not available' },
  );

  const gitleaks = checkTool(probes, {
    name: 'gitleaks',
    command: 'gitleaks',
    install: 'install gitleaks, or let the hook fall back to the docker image',
  });
  results.push(
    gitleaks.status === 'ok'
      ? gitleaks
      : {
          ...gitleaks,
          status: 'warn',
          detail: 'not installed — the secret scan falls back to docker, which is slower',
        },
  );

  for (const { port, service, variable } of FIXED_PORTS) {
    const free = await probes.isPortFree(port);
    results.push(
      free
        ? { name: `port ${port}`, status: 'ok', detail: `free for ${service}` }
        : {
            name: `port ${port}`,
            status: 'warn',
            detail: `taken — ${service} will not bind to it`,
            fix: `free the port, or set ${variable} to another one in .env`,
          },
    );
  }

  return results;
}

/**
 * @param {readonly CheckResult[]} results
 * @param {{ strict?: boolean }} [options] `strict` makes a warning fail the command
 * @returns {number} process exit code
 */
export function exitCodeFor(results, options = {}) {
  const failed = results.some(
    (result) => result.status === 'fail' || (options.strict === true && result.status === 'warn'),
  );

  return failed ? 1 : 0;
}
