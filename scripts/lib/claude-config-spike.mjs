/**
 * The pure half of the B-01 spike of plan 13 — what `scripts/claude-config-spike.mjs` builds,
 * reads off `/proc` and reports, with no SDK and no disk.
 *
 * The spike measures, against the real Claude, the facts plan 13 is designed on: what
 * `strictMcpConfig` keeps out, whether an MCP tool reaches `canUseTool` and `PreToolUse`, how a
 * server's secret reaches the CLI without the argv, what a probe that only asks costs, what a
 * project still injects with the trust mark cleared, what a stdio server inherits, whether the `!`
 * blocks of a skill and a slash command run outside the approval, and how the skills of the user
 * enter through a synthetic plugin (docs/plans/13-claude-settings/F0-contract.md#b-01).
 *
 * Everything the probes write lives under one throwaway root; nothing touches the repository or
 * the user's own `~/.claude`.
 */

import { randomBytes } from 'node:crypto';
import path from 'node:path';

/** The name of our MCP server in every probe — and so the prefix of its tools. */
export const OURS = 'ours';

/** The names of the servers that must **not** come up under `strictMcpConfig`. */
export const FOREIGN_SERVERS = Object.freeze(['projectsrv', 'agentsrv', 'pluginsrv']);

/** The files the hooks and the `!` blocks touch when they run — their presence is the measure. */
export const MARKERS = Object.freeze({
  projectHook: 'marker-project-hook',
  localHook: 'marker-local-hook',
  commandShell: 'marker-command-shell',
  skillShell: 'marker-skill-shell',
  pluginSkillShell: 'marker-plugin-skill-shell',
  subagentWrite: 'subagent-wrote.txt',
  userAllowWrite: 'user-allow-wrote.txt',
});

/** The codewords the memory files carry: which one the model repeats says which file was loaded. */
export const CODEWORDS = Object.freeze({
  project: 'PELICAN',
  local: 'KESTREL',
  user: 'OSPREY',
});

/**
 * The file a fixture server creates in the directory it starts in — relative, so it lands in the
 * session's `cwd`, where the probe looks for it.
 *
 * @param {string} name
 */
export function startMarker(name) {
  return `marker-started-${name}`;
}

/** A secret nobody else has: what the argv and the server are searched for. */
export function freshSecret() {
  return `spike-${randomBytes(12).toString('hex')}`;
}

/** The variable the fixture server's `secret` tool reads, in every probe. */
export const SECRET_VARIABLE = 'FIXTURE_SECRET';

/**
 * The stdio configuration of the fixture server.
 *
 * @param {{ node: string, server: string, name: string, started?: string, env?: Record<string, string> }} input
 *   `started` is the file the server creates when it starts
 */
export function fixtureServer({ node, server, name, started, env = {} }) {
  return {
    type: 'stdio',
    command: node,
    args: [
      server,
      '--name',
      name,
      '--secret-variable',
      SECRET_VARIABLE,
      ...(started === undefined ? [] : ['--started', started]),
    ],
    env,
  };
}

/**
 * What the throwaway repository holds: every way a project asks for MCP servers, plugins, hooks,
 * a mode of its own and a shell block — each of them something `strictMcpConfig`, the cleared trust
 * mark or `disableSkillShellExecution` has to be seen holding back.
 *
 * @param {{ node: string, server: string }} input
 * @returns {Record<string, string>} relative path → content
 */
export function repositoryFiles({ node, server }) {
  /** @param {string} marker */
  const touch = (marker) => `touch ${marker}`;
  /** @param {string} marker */
  const hook = (marker) => ({ hooks: [{ type: 'command', command: touch(marker) }] });

  return {
    'CLAUDE.md': `# Spike\n\nThe project codeword is ${CODEWORDS.project}.\n`,
    'CLAUDE.local.md': `The local codeword is ${CODEWORDS.local}.\n`,
    '.mcp.json': json({
      mcpServers: {
        projectsrv: fixtureServer({
          node,
          server,
          name: 'projectsrv',
          started: startMarker('projectsrv'),
        }),
      },
    }),
    '.claude/settings.json': json({
      enableAllProjectMcpServers: true,
      enabledMcpjsonServers: ['projectsrv'],
      enabledPlugins: { 'jar-explorer@claude-community': true },
      hooks: { PreToolUse: [{ matcher: '*', ...hook(MARKERS.projectHook) }] },
    }),
    '.claude/settings.local.json': json({
      hooks: { PreToolUse: [{ matcher: '*', ...hook(MARKERS.localHook) }] },
    }),
    '.claude/agents/writer.md': [
      '---',
      'name: writer',
      'description: Writes the file it is asked to write.',
      'permissionMode: acceptEdits',
      '---',
      '',
      'Write exactly the file you are asked to, with the content you are given, using the Write',
      'tool, and stop.',
      '',
    ].join('\n'),
    '.claude/agents/mcp-agent.md': [
      '---',
      'name: mcp-agent',
      'description: Has an MCP server of its own.',
      'mcpServers:',
      '  - agentsrv:',
      `      command: ${node}`,
      `      args: ["${server}", "--name", "agentsrv", "--started", "${startMarker('agentsrv')}"]`,
      '---',
      '',
      'Reply with the single word: ready.',
      '',
    ].join('\n'),
    '.claude/commands/shellcmd.md': [
      '---',
      'description: Runs a shell block on expansion.',
      'allowed-tools: Bash(touch:*)',
      '---',
      '',
      `Context: !\`${touch(MARKERS.commandShell)}\``,
      '',
      'Reply with the single word: done.',
      '',
    ].join('\n'),
    '.claude/skills/shellskill/SKILL.md': [
      '---',
      'name: shellskill',
      'description: A skill whose body runs a shell block on expansion. Use it when asked to.',
      'allowed-tools: Bash(touch:*)',
      '---',
      '',
      `Context: !\`${touch(MARKERS.skillShell)}\``,
      '',
      'Reply with the single word: done.',
      '',
    ].join('\n'),
  };
}

/**
 * The isolated `CLAUDE_CONFIG_DIR`, besides the copied credential: the user's settings carry the
 * `allow` rules a personal setup has — the ones that skip `canUseTool` when the user scope loads —,
 * a user memory file and a user skill.
 *
 * @returns {Record<string, string>} relative path → content
 */
export function userConfigFiles() {
  return {
    'settings.json': json({
      permissions: { allow: ['Bash(*)', 'Write', 'Edit', `mcp__${OURS}`] },
      enabledPlugins: { 'jar-explorer@claude-community': true },
    }),
    'CLAUDE.md': `The user codeword is ${CODEWORDS.user}.\n`,
    'skills/spike-user-skill/SKILL.md': [
      '---',
      'name: spike-user-skill',
      'description: A skill of the user. Reply with the word HERON when it is used.',
      '---',
      '',
      'Reply with the single word: HERON.',
      '',
    ].join('\n'),
    'skills/hooked-user-skill/SKILL.md': [
      '---',
      'name: hooked-user-skill',
      'description: A skill of the user that declares a hook.',
      'hooks:',
      '  PreToolUse:',
      '    - matcher: "*"',
      '      hooks:',
      '        - type: command',
      '          command: touch marker-user-skill-hook',
      '---',
      '',
      'Reply with the single word: done.',
      '',
    ].join('\n'),
  };
}

/**
 * A local plugin that ships an MCP server of its own and a skill with a shell block — what
 * `skipMcpDiscovery` and `disableSkillShellExecution` are seen holding back.
 *
 * @param {{ node: string, server: string }} input
 * @returns {Record<string, string>}
 */
export function pluginFiles({ node, server }) {
  return {
    '.claude-plugin/plugin.json': json({ name: 'spike-plugin', version: '1.0.0' }),
    '.mcp.json': json({
      mcpServers: {
        pluginsrv: fixtureServer({
          node,
          server,
          name: 'pluginsrv',
          started: startMarker('pluginsrv'),
        }),
      },
    }),
    'skills/pluginskill/SKILL.md': [
      '---',
      'name: pluginskill',
      'description: A plugin skill whose body runs a shell block. Use it when asked to.',
      'allowed-tools: Bash(touch:*)',
      '---',
      '',
      `Context: !\`touch ${MARKERS.pluginSkillShell}\``,
      '',
      'Reply with the single word: done.',
      '',
    ].join('\n'),
  };
}

/** The manifest of the synthetic plugin that carries the user's skills (plan 13, D-20). */
export function syntheticPluginManifest() {
  return json({ name: 'rc-user-skills', version: '0.0.0' });
}

/**
 * The Claude processes of one session, read off `/proc` entries.
 *
 * Found by the `--session-id=<id>` the SDK writes on the command line — never by binary name, which
 * would find the user's own Claude Code too.
 *
 * @param {{ pid: number, cmdline: string, status: string }[]} entries `cmdline` with its NULs
 * @param {string} sessionId
 * @returns {{ pid: number, argv: string[], rssKb: number | null }[]}
 */
export function sessionProcesses(entries, sessionId) {
  return entries
    .map((entry) => ({ ...entry, argv: entry.cmdline.split('\0').filter((arg) => arg !== '') }))
    .filter((entry) => entry.argv.some((arg) => arg === `--session-id=${sessionId}`))
    .map((entry) => ({ pid: entry.pid, argv: entry.argv, rssKb: rssOf(entry.status) }));
}

/** @param {string} status the text of `/proc/<pid>/status` */
export function rssOf(status) {
  const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
  return match === null ? null : Number(match[1]);
}

/**
 * Whether a secret appears anywhere on a command line — whole, or inside the JSON of a flag.
 *
 * @param {readonly string[]} argv
 * @param {string} secret
 */
export function argvCarries(argv, secret) {
  return argv.some((arg) => arg.includes(secret));
}

/**
 * How often each tool was seen by the hook and by the callback.
 *
 * @param {readonly { toolName: string }[]} preToolUse
 * @param {readonly { toolName: string }[]} canUseTool
 * @returns {Record<string, { preToolUse: number, canUseTool: number }>}
 */
export function tally(preToolUse, canUseTool) {
  /** @type {Record<string, { preToolUse: number, canUseTool: number }>} */
  const counts = {};
  /** @param {string} name @param {'preToolUse' | 'canUseTool'} key */
  const bump = (name, key) => {
    counts[name] ??= { preToolUse: 0, canUseTool: 0 };
    counts[name][key] += 1;
  };

  for (const call of preToolUse) bump(call.toolName, 'preToolUse');
  for (const call of canUseTool) bump(call.toolName, 'canUseTool');

  return counts;
}

/**
 * Which of the codewords a reply names.
 *
 * @param {string} reply
 * @returns {(keyof typeof CODEWORDS)[]}
 */
export function codewordsIn(reply) {
  return /** @type {(keyof typeof CODEWORDS)[]} */ (
    Object.entries(CODEWORDS)
      .filter(([, word]) => reply.toUpperCase().includes(word))
      .map(([source]) => source)
  );
}

/**
 * The names of servers in a status list that are neither ours nor expected.
 *
 * @param {readonly { name: string }[]} statuses
 * @param {readonly string[]} expected
 */
export function unexpectedServers(statuses, expected) {
  return statuses.map((status) => status.name).filter((name) => !expected.includes(name));
}

/**
 * Which variables of a list a server saw, from the names its `env_names` tool returned.
 *
 * @param {string} names one per line
 * @param {readonly string[]} wanted
 */
export function seenVariables(names, wanted) {
  const seen = new Set(names.split('\n'));
  return wanted.filter((name) => seen.has(name));
}

/**
 * The report, as Markdown: one row per measurement, with what was measured and what it decides.
 *
 * @param {readonly { id: string, question: string, answer: string, decides: string }[]} rows
 */
export function reportTable(rows) {
  /** @param {string} text */
  const escape = (text) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    '| # | Pergunta | Medido | Decide |',
    '|---|---|---|---|',
    ...rows.map(
      (row) =>
        `| ${row.id} | ${escape(row.question)} | ${escape(row.answer)} | ${escape(row.decides)} |`,
    ),
  ].join('\n');
}

/**
 * Where each file of a layout lands under its root, for the writer — `path.join`, refusing a path
 * that climbs out, so a typo in a layout can never write outside the throwaway root.
 *
 * @param {string} root
 * @param {Record<string, string>} files
 * @returns {[string, string][]}
 */
export function placed(root, files) {
  return Object.entries(files).map(([relative, content]) => {
    const target = path.join(root, relative);
    if (path.relative(root, target).startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`a spike file escapes its root: ${relative}`);
    }
    return [target, content];
  });
}

/** @param {unknown} value */
function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** @param {boolean} value */
const yesNo = (value) => (value ? 'sim' : 'não');

/** @typedef {{ id: string, question: string, answer: string, decides: string }} SpikeRow */

/** @param {any} strict @returns {SpikeRow[]} */
function strictRows({ foreignUnderStrict, startedUnderStrict, foreignWithoutStrict }) {
  const under = foreignUnderStrict.length + startedUnderStrict.length;
  return [
    {
      id: '1',
      question: 'o que sobe com strictMcpConfig',
      answer: `estranhos com strict: ${String(under)}; sem strict: ${String(foreignWithoutStrict.length)}`,
      decides: 'D-01',
    },
  ];
}

/** @param {any} approval @returns {SpikeRow[]} */
function approvalRows(approval) {
  const mcp = Object.entries(approval.byMode.default).filter(([name]) => name.startsWith('mcp__'));
  const asked = mcp.every(([, calls]) => calls.canUseTool > 0 && calls.preToolUse > 0);
  return [
    {
      id: '2',
      question: 'tool MCP passa pelo canUseTool e pelo PreToolUse',
      answer: yesNo(asked),
      decides: 'D-13',
    },
    {
      id: '6',
      question: 'o que um servidor stdio herda do CLI',
      answer: (approval.inherited ?? []).join(', '),
      decides: 'B-20',
    },
  ];
}

/** @param {any} secret @returns {SpikeRow[]} */
function secretRows({ argv, setMcpServers: control }) {
  const viaControl = `${yesNo(control.inArgv)} no argv, ${String(control.setMs)} ms, chegou ${yesNo(control.literalArrived)}`;
  const expansion = `pelo argv ${yesNo(argv.expandedArrived)}, pelo setMcpServers ${yesNo(control.expandedArrived)}`;
  return [
    {
      id: '3',
      question: 'segredo no argv · setMcpServers antes do turno · ${VAR}',
      answer: `argv: ${yesNo(argv.inArgv)}; setMcpServers: ${viaControl}; \${VAR} expandido ${expansion}`,
      decides: 'D-02',
    },
  ];
}

/** @param {any} probe @returns {SpikeRow[]} */
function probeRows(probe) {
  return [
    {
      id: '4',
      question: 'custo da sonda',
      answer: `${String(probe.initMs)} ms, ${probe.rssKb.join('+')} kB, ${String(probe.processCount)} processo, ${String(probe.messagesWithoutPrompt)} mensagens`,
      decides: 'D-05',
    },
  ];
}

/** @param {any} project @returns {SpikeRow[]} */
function projectRows({ plain, askingHook }) {
  const local = plain.codewords.includes('local') || plain.localHookRan;
  const unasked = plain.subagentWrote && (plain.calls.Write?.canUseTool ?? 0) === 0;
  return [
    {
      id: '5',
      question: 'hook de projeto · CLAUDE.local.md · subagent acceptEdits',
      answer: `hook roda: ${yesNo(plain.projectHookRan)}; local carregado: ${yesNo(local)}; subagent escreveu sem canUseTool: ${yesNo(unasked)}; com o hook respondendo ask: ${yesNo(askingHook.subagentWrote)}`,
      decides: 'D-17, D-23',
    },
  ];
}

/** @param {any} shell @returns {SpikeRow[]} */
function shellRows(shell) {
  /** @param {string} arm */
  const ran = (arm) => Object.values(shell[arm].ran).some(Boolean);
  return [
    {
      id: '7',
      question: 'bloco ! roda fora da aprovação · managed · flag',
      answer: `sem política: ${yesNo(ran('withoutPolicy'))}; managedSettings: ${yesNo(ran('managedPolicy'))}; settings: ${yesNo(ran('flagPolicy'))}`,
      decides: 'D-21, D-24',
    },
  ];
}

/** @param {any} skills @returns {SpikeRow[]} */
function skillsRows({ plain, withPlugin, regression }) {
  const others = plain.skills.filter((/** @type {string} */ name) => name.includes(':')).length;
  const synthetic = withPlugin.skills.filter((/** @type {string} */ name) =>
    name.startsWith('rc-user-skills:'),
  );
  return [
    {
      id: '8',
      question: 'skills do usuário · plugin sintético · regressão da D-11',
      answer: `sem plugin: ${String(others)} de usuário/sistema; com: ${synthetic.join(', ')}; canUseTool perguntado: ${yesNo(regression.canUseToolAskedForWrite)}, escrito: ${yesNo(regression.written)}`,
      decides: 'D-20, D-22',
    },
  ];
}

/** @param {any} flags @returns {SpikeRow[]} */
function flagsRows(flags) {
  return [
    {
      id: '9',
      question: 'output style pela camada de flag, com o hook',
      answer: `${String(flags.outputStyle)}; hook: ${yesNo(flags.hookFired)}`,
      decides: 'D-06',
    },
  ];
}

/** @param {any} locations @returns {SpikeRow[]} */
function locationsRows(locations) {
  return [
    {
      id: '10',
      question: 'de onde o CLI lê o .mcp.json',
      answer: `de uma subpasta, achou: ${locations.fromSubdirectory.join(', ') || 'nada'}`,
      decides: 'D-11',
    },
  ];
}

/** The rows each probe's results become, in the order of the task. */
const ROWS_OF = Object.freeze({
  strict: strictRows,
  approval: approvalRows,
  secret: secretRows,
  probe: probeRows,
  project: projectRows,
  shell: shellRows,
  skills: skillsRows,
  flags: flagsRows,
  locations: locationsRows,
});

/**
 * The rows of the report, from the raw results of the probes that ran — a probe that did not run,
 * or failed, has no row.
 *
 * @param {Record<string, any>} results
 * @returns {SpikeRow[]}
 */
export function spikeRows(results) {
  return Object.entries(ROWS_OF).flatMap(([name, rowsOf]) => {
    const result = results[name];
    return result === undefined || result.error !== undefined ? [] : rowsOf(result);
  });
}
