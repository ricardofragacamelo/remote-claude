import { describe, expect, it } from 'vitest';

import {
  COMPOSE_CANDIDATES,
  allHealthy,
  composeArgv,
  orphanVolumes,
  parseComposePs,
  parseLabeledRows,
  pendingServices,
  purgeStaleProjects,
  resolveComposeCli,
} from '../../../scripts/lib/compose.mjs';

/**
 * A probe that answers for the given commands and reports every other one as absent, the way
 * `run()` does for an executable that is not on PATH.
 *
 * @param {Record<string, { code?: number, stdout?: string }>} installed keyed by the full argv
 * @returns {(command: string, args: readonly string[]) => import('../../../scripts/lib/exec.mjs').RunResult}
 */
function probeFor(installed) {
  return (command, args) => {
    const key = [command, ...args].join(' ');
    const answer = installed[key];

    return answer === undefined
      ? { found: false, code: 127, stdout: '', stderr: 'ENOENT' }
      : { found: true, code: answer.code ?? 0, stdout: answer.stdout ?? '', stderr: '' };
  };
}

describe('resolveComposeCli', () => {
  it('prefers the docker plugin when it answers', () => {
    const cli = resolveComposeCli(probeFor({ 'docker compose version': { stdout: 'v2.30.3' } }));

    expect(cli).toEqual({ command: 'docker', args: ['compose'] });
  });

  it('falls back to the standalone binary when the plugin is not installed', () => {
    const cli = resolveComposeCli(probeFor({ 'docker-compose version': { stdout: 'v2.30.3' } }));

    expect(cli).toEqual({ command: 'docker-compose', args: [] });
  });

  it('rejects a plugin that is present but answers with an error', () => {
    const cli = resolveComposeCli(
      probeFor({
        'docker compose version': { code: 1 },
        'docker-compose version': { stdout: 'v2.30.3' },
      }),
    );

    expect(cli).toEqual({ command: 'docker-compose', args: [] });
  });

  it('answers null when neither form exists, rather than guessing one', () => {
    expect(resolveComposeCli(probeFor({}))).toBeNull();
  });

  it('tries every documented invocation form', () => {
    /** @type {string[]} */
    const tried = [];
    resolveComposeCli((command, args) => {
      tried.push([command, ...args].join(' '));
      return { found: false, code: 127, stdout: '', stderr: '' };
    });

    expect(tried).toHaveLength(COMPOSE_CANDIDATES.length);
  });
});

describe('composeArgv', () => {
  it('puts the project name before the subcommand, for both invocation forms', () => {
    const plugin = composeArgv({ command: 'docker', args: ['compose'] }, 'remote-claude', ['stop']);
    const binary = composeArgv({ command: 'docker-compose', args: [] }, 'remote-claude', ['stop']);

    expect(plugin).toEqual({
      command: 'docker',
      args: ['compose', '--project-name', 'remote-claude', 'stop'],
    });
    expect(binary).toEqual({
      command: 'docker-compose',
      args: ['--project-name', 'remote-claude', 'stop'],
    });
  });

  it('does not mutate the cli it was given', () => {
    const cli = { command: 'docker', args: ['compose'] };
    composeArgv(cli, 'p', ['up']);

    expect(cli.args).toEqual(['compose']);
  });
});

describe('parseLabeledRows', () => {
  it('splits name and project, ignoring blank lines', () => {
    const rows = parseLabeledRows('a_data\tproj-a\n\nb_data\tproj-b\n');

    expect(rows).toEqual([
      { name: 'a_data', project: 'proj-a' },
      { name: 'b_data', project: 'proj-b' },
    ]);
  });

  it('reads docker’s "<no value>" for an unlabelled resource as no project', () => {
    expect(parseLabeledRows('loose\t<no value>\n')).toEqual([{ name: 'loose', project: '' }]);
  });

  it('finds nothing in empty output', () => {
    expect(parseLabeledRows('   \n')).toEqual([]);
  });
});

describe('orphanVolumes', () => {
  const volumes = [
    { name: 'remote-claude_postgres-data', project: 'remote-claude' },
    { name: 'remote-claude-e2e-1_postgres-data', project: 'remote-claude-e2e-1' },
    { name: 'remote-claude-e2e-2_postgres-data', project: 'remote-claude-e2e-2' },
    { name: 'someone-else_data', project: 'someone-else' },
  ];

  it('reports the volume of a project that no longer has containers — the invisible leftover', () => {
    const orphans = orphanVolumes(volumes, new Set(['remote-claude-e2e-2']), {
      prefix: 'remote-claude',
      keep: ['remote-claude'],
    });

    expect(orphans).toEqual(['remote-claude-e2e-1_postgres-data']);
  });

  it('never touches the development stack, even with its containers gone', () => {
    const orphans = orphanVolumes(volumes, new Set(), {
      prefix: 'remote-claude',
      keep: ['remote-claude'],
    });

    expect(orphans).not.toContain('remote-claude_postgres-data');
  });

  it('never touches a project of another repository', () => {
    const orphans = orphanVolumes(volumes, new Set(), { prefix: 'remote-claude' });

    expect(orphans).not.toContain('someone-else_data');
  });

  it('reports nothing when every project is alive', () => {
    const live = new Set(['remote-claude', 'remote-claude-e2e-1', 'remote-claude-e2e-2']);

    expect(orphanVolumes(volumes, live, { prefix: 'remote-claude' })).toEqual([]);
  });
});

describe('parseComposePs', () => {
  it('reads the NDJSON shape', () => {
    const stdout = [
      '{"Service":"postgres","State":"running","Health":"healthy"}',
      '{"Service":"keycloak","State":"running","Health":"starting"}',
    ].join('\n');

    expect(parseComposePs(stdout)).toEqual([
      { service: 'postgres', state: 'running', health: 'healthy' },
      { service: 'keycloak', state: 'running', health: 'starting' },
    ]);
  });

  it('reads the JSON-array shape the same way', () => {
    const stdout = '[{"Service":"postgres","State":"running","Health":"healthy"}]';

    expect(parseComposePs(stdout)).toEqual([
      { service: 'postgres', state: 'running', health: 'healthy' },
    ]);
  });

  it('reads a service with no healthcheck as having no health', () => {
    expect(parseComposePs('{"Service":"web","State":"running"}')).toEqual([
      { service: 'web', state: 'running', health: '' },
    ]);
  });

  it('finds nothing before anything has started', () => {
    expect(parseComposePs('')).toEqual([]);
  });
});

describe('allHealthy / pendingServices', () => {
  const statuses = [
    { service: 'postgres', state: 'running', health: 'healthy' },
    { service: 'keycloak', state: 'running', health: 'starting' },
  ];

  it('is not satisfied while a service is only starting', () => {
    expect(allHealthy(statuses, ['postgres', 'keycloak'])).toBe(false);
    expect(pendingServices(statuses, ['postgres', 'keycloak'])).toEqual(['keycloak']);
  });

  it('is satisfied once every service reports healthy', () => {
    const up = statuses.map((status) => ({ ...status, health: 'healthy' }));

    expect(allHealthy(up, ['postgres', 'keycloak'])).toBe(true);
    expect(pendingServices(up, ['postgres', 'keycloak'])).toEqual([]);
  });

  it('accepts a running service that declares no healthcheck', () => {
    expect(allHealthy([{ service: 'web', state: 'running', health: '' }], ['web'])).toBe(true);
  });

  it('is not satisfied by a service that exited, healthy or not', () => {
    const exited = [{ service: 'postgres', state: 'exited', health: 'healthy' }];

    expect(allHealthy(exited, ['postgres'])).toBe(false);
  });

  it('is not satisfied by a service compose never reported at all', () => {
    expect(allHealthy([], ['postgres'])).toBe(false);
  });
});

describe('purgeStaleProjects', () => {
  const cli = { command: 'docker', args: ['compose'] };

  /**
   * @param {Record<string, { code?: number, stdout?: string, stderr?: string }>} answers
   */
  function recordingRunner(answers) {
    /** @type {string[]} */
    const calls = [];

    /** @type {import('../../../scripts/lib/compose.mjs').Runner} */
    const run = (command, args) => {
      const key = [command, ...args].join(' ');
      calls.push(key);
      const answer = answers[key] ?? {};

      return {
        found: true,
        code: answer.code ?? 0,
        stdout: answer.stdout ?? '',
        stderr: answer.stderr ?? '',
      };
    };

    return { run, calls };
  }

  const psCall =
    'docker ps --all --filter label=com.docker.compose.project --format {{.Name}}\\t{{.Label "com.docker.compose.project"}}';
  const volumeCall =
    'docker volume ls --filter label=com.docker.compose.project --format {{.Name}}\\t{{.Label "com.docker.compose.project"}}';

  it('takes down a stale project with its volumes, and removes the invisible orphan', () => {
    const { run, calls } = recordingRunner({
      [psCall]: { stdout: 'remote-claude-e2e-1-postgres-1\tremote-claude-e2e-1\n' },
      [volumeCall]: { stdout: 'remote-claude-e2e-9_postgres-data\tremote-claude-e2e-9\n' },
    });

    const report = purgeStaleProjects(run, cli, {
      prefix: 'remote-claude',
      keep: ['remote-claude'],
    });

    expect(report.projects).toEqual(['remote-claude-e2e-1']);
    expect(report.volumes).toEqual(['remote-claude-e2e-9_postgres-data']);
    expect(calls).toContain(
      'docker compose --project-name remote-claude-e2e-1 down --volumes --remove-orphans',
    );
    expect(calls).toContain('docker volume rm remote-claude-e2e-9_postgres-data');
  });

  it('leaves the development stack alone, containers or not', () => {
    const { run, calls } = recordingRunner({
      [psCall]: { stdout: 'remote-claude-postgres-1\tremote-claude\n' },
      [volumeCall]: { stdout: 'remote-claude_postgres-data\tremote-claude\n' },
    });

    const report = purgeStaleProjects(run, cli, {
      prefix: 'remote-claude',
      keep: ['remote-claude'],
    });

    expect(report).toEqual({ projects: [], volumes: [], failures: [] });
    expect(calls.some((call) => call.includes('down'))).toBe(false);
    expect(calls.some((call) => call.includes('volume rm'))).toBe(false);
  });

  it('reports what it could not remove instead of claiming success', () => {
    const { run } = recordingRunner({
      [psCall]: { stdout: '' },
      [volumeCall]: { stdout: 'remote-claude-e2e-1_data\tremote-claude-e2e-1\n' },
      'docker volume rm remote-claude-e2e-1_data': { code: 1, stderr: 'volume is in use' },
    });

    const report = purgeStaleProjects(run, cli, { prefix: 'remote-claude' });

    expect(report.volumes).toEqual([]);
    expect(report.failures).toEqual(['remote-claude-e2e-1_data: volume is in use']);
  });

  it('does nothing, and reports nothing, when there is nothing stale', () => {
    const { run } = recordingRunner({ [psCall]: { stdout: '' }, [volumeCall]: { stdout: '' } });

    expect(purgeStaleProjects(run, cli, { prefix: 'remote-claude' })).toEqual({
      projects: [],
      volumes: [],
      failures: [],
    });
  });

  it('is idempotent — a second run over the cleaned state removes nothing', () => {
    const { run } = recordingRunner({ [psCall]: { stdout: '' }, [volumeCall]: { stdout: '' } });
    const first = purgeStaleProjects(run, cli, { prefix: 'remote-claude' });
    const second = purgeStaleProjects(run, cli, { prefix: 'remote-claude' });

    expect(second).toEqual(first);
  });
});
