import { describe, expect, it } from 'vitest';

import {
  argvCarries,
  codewordsIn,
  CODEWORDS,
  fixtureServer,
  freshSecret,
  MARKERS,
  placed,
  pluginFiles,
  reportTable,
  repositoryFiles,
  rssOf,
  seenVariables,
  sessionProcesses,
  spikeRows,
  startMarker,
  syntheticPluginManifest,
  tally,
  unexpectedServers,
  userConfigFiles,
} from '../../../scripts/lib/claude-config-spike.mjs';
import {
  PARENT_SESSION_VARIABLES,
  withoutParentSession,
} from '../../../scripts/lib/parent-session.mjs';
import { maskedSecret } from '../../../e2e/fixtures/mcp-server/masked-secret.mjs';

const FILES = { node: '/usr/bin/node', server: '/srv/fixture.mjs' };

/** One file of a layout, or nothing. @param {Record<string, string>} files @param {string} name */
const of = (files, name) => files[name] ?? '';

describe('the claude-config spike — plan 13, B-01', () => {
  it('builds every door a repository has into MCP, plugins, hooks, a mode and a shell block', () => {
    const files = repositoryFiles(FILES);
    const settings = JSON.parse(of(files, '.claude/settings.json'));
    const mcp = JSON.parse(of(files, '.mcp.json'));

    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(`touch ${MARKERS.projectHook}`);
    expect(mcp.mcpServers.projectsrv.args).toContain(startMarker('projectsrv'));
    expect(of(files, 'CLAUDE.md')).toContain(CODEWORDS.project);
    expect(of(files, 'CLAUDE.local.md')).toContain(CODEWORDS.local);
    expect(of(files, '.claude/agents/writer.md')).toContain('permissionMode: acceptEdits');
    expect(of(files, '.claude/agents/mcp-agent.md')).toContain(startMarker('agentsrv'));
    expect(of(files, '.claude/commands/shellcmd.md')).toContain(
      `!\`touch ${MARKERS.commandShell}\``,
    );
    expect(of(files, '.claude/skills/shellskill/SKILL.md')).toContain(
      'allowed-tools: Bash(touch:*)',
    );
  });

  it('gives the user scope the allow rules a personal setup has, a memory file and two skills', () => {
    const files = userConfigFiles();

    expect(JSON.parse(of(files, 'settings.json')).permissions.allow).toContain('Bash(*)');
    expect(of(files, 'CLAUDE.md')).toContain(CODEWORDS.user);
    expect(of(files, 'skills/hooked-user-skill/SKILL.md')).toContain('hooks:');
    expect(of(files, 'skills/spike-user-skill/SKILL.md')).toContain('name: spike-user-skill');
  });

  it('builds a plugin with a server and a shell skill, and the synthetic manifest', () => {
    const files = pluginFiles(FILES);

    expect(JSON.parse(of(files, '.mcp.json')).mcpServers.pluginsrv.command).toBe(FILES.node);
    expect(of(files, 'skills/pluginskill/SKILL.md')).toContain(MARKERS.pluginSkillShell);
    expect(JSON.parse(syntheticPluginManifest())).toEqual({
      name: 'rc-user-skills',
      version: '0.0.0',
    });
  });

  it('describes the fixture server as stdio, configured by its arguments', () => {
    expect(fixtureServer({ ...FILES, name: 'x' })).toEqual({
      type: 'stdio',
      command: FILES.node,
      args: [FILES.server, '--name', 'x', '--secret-variable', 'FIXTURE_SECRET'],
      env: {},
    });
    expect(fixtureServer({ ...FILES, name: 'x', started: 'm', env: { A: '1' } })).toMatchObject({
      args: [FILES.server, '--name', 'x', '--secret-variable', 'FIXTURE_SECRET', '--started', 'm'],
      env: { A: '1' },
    });
  });

  it('mints a secret nobody else has', () => {
    expect(freshSecret()).toMatch(/^spike-[0-9a-f]{24}$/);
    expect(freshSecret()).not.toBe(freshSecret());
  });

  it("finds a session's processes by its --session-id, never by the binary's name", () => {
    const entries = [
      {
        pid: 10,
        cmdline: 'claude\0--session-id=abc\0--mcp-config\0{"x":"s3cret"}\0',
        status: 'Name:\tclaude\nVmRSS:\t  230624 kB\n',
      },
      { pid: 11, cmdline: 'claude\0--session-id=other\0', status: '' },
      { pid: 12, cmdline: 'claude\0', status: 'VmRSS: 1 kB' },
    ];

    const found = sessionProcesses(entries, 'abc');

    expect(found).toEqual([
      {
        pid: 10,
        argv: ['claude', '--session-id=abc', '--mcp-config', '{"x":"s3cret"}'],
        rssKb: 230624,
      },
    ]);
    expect(argvCarries(found[0]?.argv ?? [], 's3cret')).toBe(true);
    expect(argvCarries(found[0]?.argv ?? [], 'absent')).toBe(false);
    expect(rssOf('Name: x\n')).toBeNull();
  });

  it('counts what the hook and the callback each saw, per tool', () => {
    expect(
      tally(
        [{ toolName: 'Bash' }, { toolName: 'Read' }, { toolName: 'Bash' }],
        [{ toolName: 'Bash' }],
      ),
    ).toEqual({ Bash: { preToolUse: 2, canUseTool: 1 }, Read: { preToolUse: 1, canUseTool: 0 } });
  });

  it('reads which memory file a reply came from, by its codeword', () => {
    expect(codewordsIn(`the codewords are ${CODEWORDS.project.toLowerCase()} and nothing`)).toEqual(
      ['project'],
    );
    expect(codewordsIn('none')).toEqual([]);
  });

  it('names the servers that should not be there, and the variables a server saw', () => {
    expect(unexpectedServers([{ name: 'ours' }, { name: 'projectsrv' }], ['ours'])).toEqual([
      'projectsrv',
    ]);
    expect(seenVariables('HOME\nPATH\nRC_X', ['RC_X', 'DATABASE_URL'])).toEqual(['RC_X']);
  });

  it('writes the report as a Markdown table, escaping what would break a row', () => {
    expect(reportTable([{ id: '1', question: 'a|b', answer: 'x\ny', decides: 'D-01' }])).toBe(
      [
        '| # | Pergunta | Medido | Decide |',
        '|---|---|---|---|',
        '| 1 | a\\|b | x y | D-01 |',
      ].join('\n'),
    );
  });

  it('refuses a layout file that would land outside its root', () => {
    expect(placed('/root', { 'a/b.txt': 'x' })).toEqual([['/root/a/b.txt', 'x']]);
    expect(() => placed('/root', { '../escape': 'x' })).toThrow(/escapes its root/);
    expect(() => placed('/root', { '/etc/passwd': 'x' })).toThrow(/escapes its root/);
  });

  it('masks a secret to its length and a hash prefix, never the value', () => {
    expect(maskedSecret('abc')).toBe('set length=3 sha256=ba7816bf8f01');
    expect(maskedSecret('')).toBe('unset');
    expect(maskedSecret(undefined)).toBe('unset');
  });
});

describe('the rows of the spike report', () => {
  const results = {
    strict: { foreignUnderStrict: [], startedUnderStrict: [], foreignWithoutStrict: ['p', 'q'] },
    approval: {
      byMode: {
        default: {
          ToolSearch: { preToolUse: 1, canUseTool: 0 },
          mcp__ours__echo: { preToolUse: 1, canUseTool: 1 },
        },
      },
      inherited: ['HOME', 'PATH'],
    },
    secret: {
      argv: { inArgv: true, expandedArrived: true },
      setMcpServers: { inArgv: false, setMs: 512, literalArrived: true, expandedArrived: false },
    },
    probe: { initMs: 1200, rssKb: [230000], processCount: 1, messagesWithoutPrompt: 0 },
    project: {
      plain: {
        projectHookRan: true,
        codewords: ['project'],
        localHookRan: false,
        subagentWrote: true,
        calls: { Write: { preToolUse: 1, canUseTool: 0 } },
      },
      askingHook: { subagentWrote: false },
    },
    shell: {
      withoutPolicy: { ran: { command: true } },
      managedPolicy: { ran: { command: true } },
      flagPolicy: { ran: { command: false } },
    },
    skills: {
      plain: { skills: ['init', 'shellskill'] },
      withPlugin: { skills: ['rc-user-skills:a', 'init'] },
      regression: { canUseToolAskedForWrite: true, written: false },
    },
    flags: { outputStyle: 'Explanatory', hookFired: true },
    locations: { fromSubdirectory: [] },
  };

  it('has one row per measurement that ran, and none for one that failed', () => {
    const rows = spikeRows({ ...results, locations: { error: 'boom' } });
    /** @param {string} id */
    const answer = (id) => rows.find((row) => row.id === id)?.answer;

    expect(rows.map((row) => row.id)).toEqual(['1', '2', '6', '3', '4', '5', '7', '8', '9']);
    expect(answer('1')).toBe('estranhos com strict: 0; sem strict: 2');
    expect(answer('2')).toBe('sim');
    expect(answer('3')).toContain('argv: sim; setMcpServers: não no argv, 512 ms');
    expect(answer('5')).toContain('subagent escreveu sem canUseTool: sim');
    expect(answer('7')).toBe('sem política: sim; managedSettings: sim; settings: não');
    expect(answer('8')).toContain('com: rc-user-skills:a');
    expect(answer('9')).toBe('Explanatory; hook: sim');
  });

  it('says nothing was found, when the CLI read no .mcp.json from a subfolder', () => {
    expect(spikeRows({ locations: { fromSubdirectory: [] } })[0]?.answer).toBe(
      'de uma subpasta, achou: nada',
    );
    expect(spikeRows({ approval: { ...results.approval, inherited: null } })[1]?.answer).toBe('');
  });

  it('reports a local memory file as loaded when its codeword or its hook shows it', () => {
    const local = {
      project: {
        ...results.project,
        plain: { ...results.project.plain, codewords: ['local'], calls: {} },
      },
    };
    expect(spikeRows(local)[0]?.answer).toContain('local carregado: sim');
  });
});

describe('the environment without a parent Claude Code session', () => {
  it('drops what a running session puts in the environment, and keeps the rest', () => {
    const environment = {
      PATH: '/bin',
      CLAUDE_CODE_ENTRYPOINT: 'claude-vscode',
      CLAUDE_CONFIG_DIR: '/c',
      ...Object.fromEntries(PARENT_SESSION_VARIABLES.map((name) => [name, '1'])),
    };

    expect(withoutParentSession(environment)).toEqual({ PATH: '/bin', CLAUDE_CONFIG_DIR: '/c' });
  });
});
