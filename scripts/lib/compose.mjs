/**
 * Talking to Docker Compose from the scripts in `scripts/`.
 *
 * Two things live here that a caller should never re-invent. First, **which** compose to call:
 * v2 ships both as a `docker compose` plugin and as a standalone `docker-compose` binary, and a
 * machine may have either one. Hard-coding the plugin form makes the whole local stack
 * unavailable on a machine that only has the binary — for no reason, since the two take the
 * same arguments.
 *
 * Second, purging what a crash leaves behind. Killing a run abruptly (SIGKILL, a closed
 * terminal) removes the containers but leaves the **named volumes**, and those are invisible to
 * `compose ls` because that command lists projects, and the project no longer has containers.
 * Nothing reclaims them, so the disk fills up over weeks.
 */

/** Invocation forms of Compose v2, in the order they are tried. */
export const COMPOSE_CANDIDATES = [
  { command: 'docker', args: ['compose'] },
  { command: 'docker-compose', args: [] },
];

/** Label Compose puts on every resource it creates, naming the project it belongs to. */
export const PROJECT_LABEL = 'com.docker.compose.project';

/**
 * @typedef {{ command: string, args: string[] }} ComposeCli
 */

/**
 * The first invocation form that answers on this machine.
 *
 * @param {(command: string, args: readonly string[]) => import('./exec.mjs').RunResult} probe
 * @returns {ComposeCli | null} `null` when neither form is installed
 */
export function resolveComposeCli(probe) {
  for (const candidate of COMPOSE_CANDIDATES) {
    const result = probe(candidate.command, [...candidate.args, 'version']);

    if (result.found && result.code === 0) {
      return { command: candidate.command, args: [...candidate.args] };
    }
  }

  return null;
}

/**
 * The full command line for a compose call, project name included.
 *
 * @param {ComposeCli} cli
 * @param {string} project value of `--project-name`
 * @param {readonly string[]} args
 * @returns {{ command: string, args: string[] }}
 */
export function composeArgv(cli, project, args) {
  return { command: cli.command, args: [...cli.args, '--project-name', project, ...args] };
}

/**
 * Rows of a `--format '{{.Name}}\t{{.Label "…"}}'` listing.
 *
 * @param {string} stdout
 * @returns {{ name: string, project: string }[]}
 */
export function parseLabeledRows(stdout) {
  return stdout
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row !== '')
    .map((row) => {
      const [name = '', project = ''] = row.split('\t');
      return { name, project: project === '<no value>' ? '' : project };
    });
}

/**
 * Volumes of a compose project that no longer has any container — the leftovers described at the
 * top of this file.
 *
 * @param {readonly { name: string, project: string }[]} volumes every compose-labelled volume
 * @param {ReadonlySet<string>} liveProjects projects that still have containers
 * @param {{ prefix: string, keep?: readonly string[] }} scope only projects under `prefix` are
 *   considered, and `keep` names the ones never touched (the development stack, typically)
 * @returns {string[]} volume names to remove
 */
export function orphanVolumes(volumes, liveProjects, scope) {
  const keep = new Set(scope.keep ?? []);

  return volumes
    .filter(
      (volume) =>
        volume.project.startsWith(scope.prefix) &&
        !keep.has(volume.project) &&
        !liveProjects.has(volume.project),
    )
    .map((volume) => volume.name);
}

/** `--format` template that pairs a resource name with its compose project. */
const NAME_AND_PROJECT = `{{.Name}}\\t{{.Label "${PROJECT_LABEL}"}}`;

/**
 * @typedef {(command: string, args: readonly string[]) => import('./exec.mjs').RunResult} Runner
 */

/**
 * @typedef {object} PurgeReport
 * @property {string[]} projects projects taken down, with their volumes
 * @property {string[]} volumes orphan volumes removed on their own
 * @property {string[]} failures what could not be removed, and why
 */

/**
 * Removes what earlier runs left behind: compose projects still holding containers, and the
 * orphan named volumes of projects whose containers are already gone.
 *
 * @param {Runner} run
 * @param {ComposeCli} cli
 * @param {{ prefix: string, keep?: readonly string[] }} scope
 * @returns {PurgeReport}
 */
export function purgeStaleProjects(run, cli, scope) {
  const keep = new Set(scope.keep ?? []);
  /** @type {PurgeReport} */
  const report = { projects: [], volumes: [], failures: [] };

  const containers = run('docker', [
    'ps',
    '--all',
    '--filter',
    `label=${PROJECT_LABEL}`,
    '--format',
    NAME_AND_PROJECT,
  ]);

  const staleProjects = new Set(
    parseLabeledRows(containers.stdout)
      .map((row) => row.project)
      .filter((project) => project.startsWith(scope.prefix) && !keep.has(project)),
  );

  for (const project of [...staleProjects].sort()) {
    const { command, args } = composeArgv(cli, project, ['down', '--volumes', '--remove-orphans']);
    const result = run(command, args);

    if (result.code === 0) {
      report.projects.push(project);
    } else {
      report.failures.push(`${project}: ${result.stderr.trim() || `exit ${String(result.code)}`}`);
    }
  }

  // Listed only now: the teardown above already removed the volumes of those projects, and what
  // is left is precisely the set `compose ls` cannot see — no containers, so no project.
  const volumes = run('docker', [
    'volume',
    'ls',
    '--filter',
    `label=${PROJECT_LABEL}`,
    '--format',
    NAME_AND_PROJECT,
  ]);

  const live = new Set(parseLabeledRows(containers.stdout).map((row) => row.project));

  for (const name of orphanVolumes(parseLabeledRows(volumes.stdout), live, scope)) {
    const result = run('docker', ['volume', 'rm', name]);

    if (result.code === 0) {
      report.volumes.push(name);
    } else {
      report.failures.push(`${name}: ${result.stderr.trim() || `exit ${String(result.code)}`}`);
    }
  }

  return report;
}

/**
 * @typedef {object} ServiceStatus
 * @property {string} service
 * @property {string} state e.g. `running`, `exited`
 * @property {string} health `healthy`, `starting`, `unhealthy`, or empty when the service
 *   declares no healthcheck
 */

/**
 * Reads `compose ps --format json`, which is NDJSON in Compose v2 and a JSON array in some
 * builds. Both shapes are accepted, because the script cannot choose which one it gets.
 *
 * @param {string} stdout
 * @returns {ServiceStatus[]}
 */
export function parseComposePs(stdout) {
  const text = stdout.trim();
  if (text === '') {
    return [];
  }

  /** @type {unknown[]} */
  let rows;
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    rows = text
      .split('\n')
      .filter((row) => row.trim() !== '')
      .map((row) => JSON.parse(row));
  }

  return rows.map((row) => {
    const record = /** @type {Record<string, unknown>} */ (row);
    return {
      service: String(record['Service'] ?? ''),
      state: String(record['State'] ?? ''),
      health: String(record['Health'] ?? ''),
    };
  });
}

/**
 * Whether every named service is up and, when it declares a healthcheck, healthy.
 *
 * @param {readonly ServiceStatus[]} statuses
 * @param {readonly string[]} services
 * @returns {boolean}
 */
export function allHealthy(statuses, services) {
  return services.every((service) => {
    const status = statuses.find((candidate) => candidate.service === service);
    if (status === undefined || status.state !== 'running') {
      return false;
    }

    return status.health === '' || status.health === 'healthy';
  });
}

/**
 * The services that are not yet up, for an error that names them.
 *
 * @param {readonly ServiceStatus[]} statuses
 * @param {readonly string[]} services
 * @returns {string[]}
 */
export function pendingServices(statuses, services) {
  return services.filter((service) => !allHealthy(statuses, [service]));
}
