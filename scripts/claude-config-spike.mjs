#!/usr/bin/env node
/**
 * The B-01 spike of plan 13: the measurements the design of "Configuração do Claude" rests on,
 * taken against the real Claude (docs/plans/13-claude-settings/F0-contract.md#b-01).
 *
 *   node scripts/claude-config-spike.mjs [probe…] [--json <file>]
 *
 * Probes, in the order of the task: `strict`, `approval`, `secret`, `probe`, `project`, `shell`,
 * `skills`, and two that came of them: `flags` and `locations`. With no name, every one runs. Each turn of a probe costs quota — a handful of small
 * turns in all — and the `probe`, `strict` and the idle half of `skills` cost none.
 *
 * It never touches the user's `~/.claude`: every run gets a `CLAUDE_CONFIG_DIR` of its own, under a
 * throwaway root, with the credential **copied** into it — as plan 01's B-45 did, so the spike does
 * not dispute `.claude.json` with a Claude Code open on the same machine. The repository it runs in
 * is generated per run, as plan 04's D-07 asks of anything that may write. The MCP server is ours,
 * `e2e/fixtures/mcp-server/fixture-mcp-server.mjs` (D-19).
 *
 * The output is a Markdown table — what each question measured, and what it decides — and, with
 * `--json`, every raw number. Exits 0 when every probe ran; a result that is bad for the design is
 * not a failure of the spike, it is what the spike exists to find.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  argvCarries,
  codewordsIn,
  fixtureServer,
  FOREIGN_SERVERS,
  freshSecret,
  MARKERS,
  OURS,
  placed,
  pluginFiles,
  reportTable,
  SECRET_VARIABLE,
  repositoryFiles,
  seenVariables,
  sessionProcesses,
  spikeRows,
  startMarker,
  syntheticPluginManifest,
  tally,
  unexpectedServers,
  userConfigFiles,
} from './lib/claude-config-spike.mjs';
import { copyCredential, runSpike, spikeSession } from './lib/spike-session.mjs';
import { repoRoot } from './lib/paths.mjs';
import { maskedSecret } from '../e2e/fixtures/mcp-server/masked-secret.mjs';
import { fail, info, line, ok, title } from './lib/ui.mjs';

const SERVER = path.join(repoRoot, 'e2e', 'fixtures', 'mcp-server', 'fixture-mcp-server.mjs');
const NODE = process.execPath;

/** The model the turns run on: cheap, and enough to call a named tool. `SPIKE_MODEL` overrides. */
const MODEL = process.env['SPIKE_MODEL'] ?? 'haiku';

const PROBES = [
  'strict',
  'approval',
  'secret',
  'probe',
  'project',
  'shell',
  'skills',
  'flags',
  'locations',
];

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------
// The throwaway world
// ---------------------------------------------------------------------------------------------

/** @param {string} root @param {Record<string, string>} files */
function writeAll(root, files) {
  for (const [target, content] of placed(root, files)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

/**
 * The isolated configuration: the credential copied with its mode, the user's settings with the
 * `allow` rules a personal setup has, a user skill, the skills synced from claude.ai and one
 * installed plugin — copies, so nothing the CLI does reaches the originals.
 *
 * @param {string} root
 */
function makeConfig(root) {
  const source = process.env['CLAUDE_CONFIG_DIR'] ?? path.join(os.homedir(), '.claude');
  const config = path.join(root, 'config');
  writeAll(config, userConfigFiles());

  copyCredential(source, config);

  const synced = path.join(source, 'skills', 'synced');
  if (fs.existsSync(synced)) {
    fs.cpSync(synced, path.join(config, 'skills', 'synced'), { recursive: true });
  }

  copyInstalledPlugin(source, config);
  return config;
}

/**
 * One plugin the machine's Claude Code installed, copied with its records rewritten to the copy:
 * what says whether a project's `enabledPlugins` — or nothing at all — loads it under
 * `settingSources: ['project']`.
 *
 * @param {string} source @param {string} config
 */
function copyInstalledPlugin(source, config) {
  const recordFile = path.join(source, 'plugins', 'installed_plugins.json');
  if (!fs.existsSync(recordFile)) {
    return;
  }

  const records = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  const [id, installs] = Object.entries(records.plugins ?? {})[0] ?? [];
  if (id === undefined) {
    return;
  }

  const copy = path.join(config, 'plugins', 'cache', id.replace('@', '-'));
  fs.cpSync(installs[0].installPath, copy, {
    recursive: true,
    filter: (file) => !file.includes(`${path.sep}.in_use`) && !file.includes(`${path.sep}.git`),
  });
  fs.writeFileSync(
    path.join(config, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { [id]: [{ ...installs[0], installPath: copy }] } }),
  );

  const marketplace = id.split('@')[1] ?? '';
  const known = path.join(source, 'plugins', 'known_marketplaces.json');
  if (fs.existsSync(known)) {
    const entry = JSON.parse(fs.readFileSync(known, 'utf8'))[marketplace];
    const location = path.join(config, 'plugins', 'marketplaces', marketplace);
    fs.mkdirSync(path.join(location, '.claude-plugin'), { recursive: true });
    fs.copyFileSync(
      path.join(entry.installLocation, '.claude-plugin', 'marketplace.json'),
      path.join(location, '.claude-plugin', 'marketplace.json'),
    );
    fs.writeFileSync(
      path.join(config, 'plugins', 'known_marketplaces.json'),
      JSON.stringify({ [marketplace]: { ...entry, installLocation: location } }),
    );
  }

  return id;
}

/** A fresh copy of the throwaway repository. @param {string} root @param {string} name */
function makeRepository(root, name) {
  const repository = path.join(root, name);
  writeAll(repository, repositoryFiles({ node: NODE, server: SERVER }));
  return repository;
}

/** @param {string} root */
function makePlugin(root) {
  const plugin = path.join(root, 'spike-plugin');
  writeAll(plugin, pluginFiles({ node: NODE, server: SERVER }));
  return plugin;
}

/**
 * The synthetic plugin of D-20: a manifest of ours and, under `skills/`, a link to each skill of
 * the user — nothing else.
 *
 * @param {string} root @param {string} config
 */
function makeSyntheticPlugin(root, config) {
  const plugin = path.join(root, 'rc-user-skills');
  fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), syntheticPluginManifest());
  fs.mkdirSync(path.join(plugin, 'skills'));
  for (const skill of ['spike-user-skill', 'hooked-user-skill']) {
    fs.symlinkSync(path.join(config, 'skills', skill), path.join(plugin, 'skills', skill));
  }
  return plugin;
}

// ---------------------------------------------------------------------------------------------
// One session
// ---------------------------------------------------------------------------------------------

/**
 * A session of this spike: the product's options, on the model of the spike.
 *
 * @param {any} sdk @param {Omit<import('./lib/spike-session.mjs').SessionSpec, 'model'>} spec
 */
const session = (sdk, spec) => spikeSession(sdk, { ...spec, model: MODEL });

/**
 * A session in a fresh copy of the throwaway repository.
 *
 * @param {any} sdk @param {{ root: string, config: string }} world @param {string} name
 * @param {Omit<import('./lib/spike-session.mjs').SessionSpec, 'cwd' | 'config' | 'model'>} spec
 */
async function inRepository(sdk, world, name, spec) {
  const repository = makeRepository(world.root, name);
  const run = await session(sdk, { ...spec, cwd: repository, config: world.config });
  return { repository, run };
}

/** The processes of a session, read off `/proc`. @param {string} sessionId */
function processesOf(sessionId) {
  const entries = [];
  for (const name of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      entries.push({
        pid: Number(name),
        cmdline: fs.readFileSync(`/proc/${name}/cmdline`, 'utf8'),
        status: fs.readFileSync(`/proc/${name}/status`, 'utf8'),
      });
    } catch {
      // The process ended between the listing and the read — not one of ours.
    }
  }
  return sessionProcesses(entries, sessionId);
}

/** Waits for the MCP servers to leave `pending`, up to a bound. @param {any} query */
async function settledStatus(query, boundMs = 20_000) {
  const started = Date.now();
  for (;;) {
    /** @type {{ name: string, status: string, source?: string, scope?: string, tools?: { name: string, annotations?: unknown }[] }[]} */
    const statuses = await query.mcpServerStatus();
    if (!statuses.some((s) => s.status === 'pending') || Date.now() - started > boundMs) {
      return statuses.map((s) => ({
        name: s.name,
        status: s.status,
        source: s.source ?? null,
        scope: s.scope ?? null,
        tools: (s.tools ?? []).map((tool) => ({ name: tool.name, annotations: tool.annotations })),
      }));
    }
    await sleep(500);
  }
}

/** The text of a tool result's content, a string or a list of parts. @param {unknown} content */
function textOf(content) {
  return Array.isArray(content)
    ? content.map((part) => part.text ?? '').join('')
    : String(content ?? '');
}

/** The text of every tool result, by the name of the tool that produced it. @param {any[]} messages */
function toolResults(messages) {
  const names = new Map();
  const results = [];
  const blocks = messages.flatMap((message) => message.message?.content ?? []);
  for (const block of blocks.filter((each) => typeof each === 'object' && each !== null)) {
    if (block.type === 'tool_use') names.set(block.id, block.name);
    if (block.type === 'tool_result') {
      results.push({
        tool: names.get(block.tool_use_id) ?? 'unknown',
        text: textOf(block.content),
      });
    }
  }
  return results;
}

/** The assistant's text, all of it. @param {any[]} messages */
function replyOf(messages) {
  return messages
    .filter((message) => message.type === 'assistant')
    .flatMap((message) => message.message.content)
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/** @param {string} directory @param {string} marker */
const exists = (directory, marker) => fs.existsSync(path.join(directory, marker));

// ---------------------------------------------------------------------------------------------
// The probes
// ---------------------------------------------------------------------------------------------

/**
 * Every probe takes the SDK, untyped — it is imported by path, from the backend — and the world.
 *
 * @typedef {{ root: string, config: string }} World
 * @typedef {(sdk: any, world: World) => Promise<any>} Probe
 */

/** 1 · What comes up with `strictMcpConfig` — and, as the control arm, without it (D-01, S-01). */
/** @type {Probe} */
async function strict(sdk, world) {
  const repository = makeRepository(world.root, 'strict-repo');
  const plugin = makePlugin(world.root);
  const ours = { [OURS]: fixtureServer({ node: NODE, server: SERVER, name: OURS }) };
  /** @param {boolean} strictMcpConfig */
  const arm = (strictMcpConfig) =>
    session(sdk, {
      cwd: repository,
      config: world.config,
      options: { mcpServers: ours, strictMcpConfig, plugins: [{ type: 'local', path: plugin }] },
      before: (query) => settledStatus(query),
    });

  const withStrict = await arm(true);
  const startedUnderStrict = FOREIGN_SERVERS.filter((name) =>
    exists(repository, startMarker(name)),
  );
  const without = await arm(false);
  const startedWithoutStrict = FOREIGN_SERVERS.filter((name) =>
    exists(repository, startMarker(name)),
  );
  return {
    startedUnderStrict,
    startedWithoutStrict,
    strict: withStrict.extra,
    withoutStrict: without.extra,
    foreignUnderStrict: unexpectedServers(withStrict.extra, [OURS]),
    foreignWithoutStrict: unexpectedServers(without.extra, [OURS]),
  };
}

/** 2 + 6 · An MCP tool, the hook and the callback, in two modes; what a server inherits (D-13, S-02, S-05). */
/** @type {Probe} */
async function approval(sdk, world) {
  const cwd = fs.mkdtempSync(path.join(world.root, 'approval-'));
  const ours = { [OURS]: fixtureServer({ node: NODE, server: SERVER, name: OURS }) };
  const prompt =
    `Call the mcp__${OURS}__echo tool with text "hi", then the mcp__${OURS}__peek tool, then the ` +
    `mcp__${OURS}__env_names tool. Use no other tool, do not ask me anything, then reply: done.`;
  const env = { SPIKE_PARENT_ONLY: '1', DATABASE_URL: 'postgres://spike', RC_SPIKE: '1' };

  /** @param {string} permissionMode */
  const arm = (permissionMode) =>
    session(sdk, {
      cwd,
      config: world.config,
      env,
      options: { mcpServers: ours, strictMcpConfig: true, permissionMode },
      prompts: [prompt],
    });

  /** @type {Record<string, unknown>} */
  const byMode = {};
  let inherited = null;
  for (const mode of ['default', 'acceptEdits']) {
    const run = await arm(mode);
    byMode[mode] = tally(run.seen.preToolUse, run.seen.canUseTool);
    const names = toolResults(run.messages).find((r) => r.tool.endsWith('env_names'));
    inherited ??=
      names === undefined
        ? null
        : seenVariables(names.text, [...Object.keys(env), 'CLAUDE_CONFIG_DIR', 'HOME', 'PATH']);
  }
  return { byMode, inherited };
}

/** 3 · The secret: argv or not, `setMcpServers` before the first turn, `${VAR}` (D-02, S-03). */
/** @type {Probe} */
async function secret(sdk, world) {
  const cwd = fs.mkdtempSync(path.join(world.root, 'secret-'));
  const literal = freshSecret();
  const expanded = freshSecret();
  const servers = {
    [OURS]: fixtureServer({
      node: NODE,
      server: SERVER,
      name: OURS,
      env: { [SECRET_VARIABLE]: literal },
    }),
    exp: fixtureServer({
      node: NODE,
      server: SERVER,
      name: 'exp',
      env: { [SECRET_VARIABLE]: '${SPIKE_EXPANDED}' },
    }),
  };
  const prompt =
    `Call the mcp__${OURS}__secret tool and the mcp__exp__secret tool, then reply with exactly ` +
    'what each returned. Use no other tool.';
  const env = { SPIKE_EXPANDED: expanded };
  /** @param {{ messages: any[] }} run */
  const read = (run) => {
    const results = toolResults(run.messages);
    /** @param {string} tool */
    const of = (tool) => results.find((r) => r.tool === tool)?.text ?? null;
    return {
      literalArrived: of(`mcp__${OURS}__secret`) === maskedSecret(literal),
      expandedArrived: of('mcp__exp__secret') === maskedSecret(expanded),
      expansionLiteral: of('mcp__exp__secret') === maskedSecret('${SPIKE_EXPANDED}'),
      results,
    };
  };

  const viaArgv = await session(sdk, {
    cwd,
    config: world.config,
    env,
    options: { mcpServers: servers, strictMcpConfig: true },
    prompts: [prompt],
    before: async (_query, sessionId) => {
      await sleep(1_000);
      const argv = processesOf(sessionId).flatMap((p) => p.argv);
      return { inArgv: argvCarries(argv, literal) };
    },
  });

  const viaControl = await session(sdk, {
    cwd,
    config: world.config,
    env,
    prompts: [prompt],
    before: async (query, sessionId) => {
      const started = Date.now();
      const result = await query.setMcpServers(servers);
      const setMs = Date.now() - started;
      const statusRightAfter = (await query.mcpServerStatus()).map((/** @type {any} */ s) => ({
        name: s.name,
        status: s.status,
        tools: (s.tools ?? []).length,
      }));
      const argv = processesOf(sessionId).flatMap((p) => p.argv);
      return { setMs, result, statusRightAfter, inArgv: argvCarries(argv, literal) };
    },
  });

  return {
    argv: { ...viaArgv.extra, ...read(viaArgv) },
    setMcpServers: { ...viaControl.extra, ...read(viaControl) },
  };
}

/** 4 · What a probe that only asks costs (D-05, S-04). */
/** @type {Probe} */
async function probe(sdk, world) {
  const cwd = fs.mkdtempSync(path.join(world.root, 'probe-'));
  const run = await session(sdk, {
    cwd,
    config: world.config,
    before: async (query, sessionId) => {
      const started = Date.now();
      const init = await query.initializationResult();
      const initMs = Date.now() - started;
      const account = await query.accountInfo();
      const processes = processesOf(sessionId);
      return {
        initMs,
        rssKb: processes.map((p) => p.rssKb),
        processCount: processes.length,
        commands: init.commands.length,
        agents: init.agents.map((/** @type {any} */ agent) => agent.name),
        models: init.models.map((/** @type {any} */ model) => model.value),
        outputStyle: init.output_style,
        outputStyles: init.available_output_styles,
        accountKeys: Object.keys(init.account ?? {}).sort(),
        accountProvider: account.apiProvider ?? null,
        mcpServers: (await query.mcpServerStatus()).length,
      };
    },
  });
  return { ...run.extra, messagesWithoutPrompt: run.messages.length };
}

/**
 * 5 · What the project still injects with the trust mark cleared (D-17, R-03) — and whether the
 * `PreToolUse` hook answering `ask` when a call runs under a wider mode than the session's sends it
 * back to `canUseTool`.
 */
/** @type {Probe} */
async function project(sdk, world) {
  /** @param {string} name @param {((input: any) => unknown) | undefined} hookAnswer */
  const arm = async (name, hookAnswer) => {
    const { repository, run } = await inRepository(sdk, world, name, {
      allows: (tool) => tool === 'Bash' || tool === 'Agent',
      hookAnswer,
      prompts: [
        'Run the shell command `echo hi` with the Bash tool. Then list every codeword your ' +
          'instructions or memory files mention, and nothing else.',
        `Use the Agent tool with the writer subagent, in the foreground, to create the file ` +
          `${MARKERS.subagentWrite} containing the word yes. Do not write it yourself. Wait for it.`,
        'Use the Agent tool with the mcp-agent subagent, in the foreground, with the task: say ready.',
      ],
    });
    return {
      codewords: codewordsIn(replyOf(run.messages)),
      projectHookRan: exists(repository, MARKERS.projectHook),
      localHookRan: exists(repository, MARKERS.localHook),
      subagentWrote: exists(repository, MARKERS.subagentWrite),
      agentServerStarted: exists(repository, startMarker('agentsrv')),
      hookSaw: run.seen.preToolUse,
      calls: tally(run.seen.preToolUse, run.seen.canUseTool),
    };
  };

  /** @param {any} input */
  const ask = (input) =>
    input.permission_mode !== undefined && input.permission_mode !== 'default'
      ? {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason: 'a wider mode than the session asks the human',
          },
        }
      : { continue: true };

  return { plain: await arm('project-repo', undefined), askingHook: await arm('project-ask', ask) };
}

/** 7 · The `!` blocks of a command and of skills, with and without the policy (D-21). */
/** @type {Probe} */
async function shell(sdk, world) {
  const plugin = makePlugin(world.root);
  /** @param {string} name @param {Record<string, unknown>} policy */
  const arm = async (name, policy) => {
    const { repository, run } = await inRepository(sdk, world, name, {
      allows: (tool) => tool === 'Skill',
      options: {
        plugins: [{ type: 'local', path: plugin, skipMcpDiscovery: true }],
        ...policy,
      },
      prompts: [
        '/shellcmd',
        'Use the Skill tool to run the shellskill skill.',
        'Use the Skill tool to run the spike-plugin:pluginskill skill.',
      ],
    });
    const ran = {
      command: exists(repository, MARKERS.commandShell),
      projectSkill: exists(repository, MARKERS.skillShell),
      pluginSkill: exists(repository, MARKERS.pluginSkillShell),
    };
    fs.rmSync(path.join(repository, MARKERS.pluginSkillShell), { force: true });
    return {
      ran,
      reply: replyOf(run.messages),
      calls: tally(run.seen.preToolUse, run.seen.canUseTool),
    };
  };

  const policy = { disableSkillShellExecution: true };
  return {
    withoutPolicy: await arm('shell-repo-open', {}),
    managedPolicy: await arm('shell-repo-managed', { managedSettings: policy }),
    flagPolicy: await arm('shell-repo-flag', { settings: policy }),
  };
}

/** 8 · The skills: what `['project']` loads, the synthetic plugin, and the D-11 regression (D-20, D-22). */
/** @type {Probe} */
async function skills(sdk, world) {
  const repository = makeRepository(world.root, 'skills-repo');
  const synthetic = makeSyntheticPlugin(world.root, world.config);
  /** @param {any} query */
  const listed = async (query) => {
    const reloaded = await query.reloadSkills();
    const commands = await query.supportedCommands();
    const init = await query.initializationResult();
    return {
      skills: reloaded.skills.map((/** @type {any} */ skill) => skill.name),
      commands: commands.map((/** @type {any} */ command) => command.name),
      agents: init.agents.map((/** @type {any} */ agent) => agent.name),
    };
  };

  const plain = await session(sdk, {
    cwd: repository,
    config: world.config,
    before: listed,
  });
  const withPlugin = await session(sdk, {
    cwd: repository,
    config: world.config,
    options: {
      plugins: [{ type: 'local', path: synthetic, skipMcpDiscovery: true }],
    },
    before: listed,
    allows: () => false,
    prompts: [`Use the Write tool to create ${MARKERS.userAllowWrite} containing yes.`],
  });

  /** @param {{ commands: string[], skills: string[] }} list */
  const nonSkills = (list) => list.commands.filter((name) => !list.skills.includes(name)).length;
  return {
    plain: plain.extra,
    withPlugin: withPlugin.extra,
    commandsThatAreNotSkills: {
      plain: nonSkills(plain.extra),
      withPlugin: nonSkills(withPlugin.extra),
    },
    regression: {
      canUseToolAskedForWrite: withPlugin.seen.canUseTool.some((call) => call.toolName === 'Write'),
      written: exists(repository, MARKERS.userAllowWrite),
    },
  };
}

/** 9 · The flag layer at the start: output style and effort, with the hooks kept (D-06, B-15). */
/** @type {Probe} */
async function flags(sdk, world) {
  const cwd = fs.mkdtempSync(path.join(world.root, 'flags-'));
  const run = await session(sdk, {
    cwd,
    config: world.config,
    options: {
      settings: { outputStyle: 'Explanatory', effortLevel: 'low' },
      fallbackModel: 'sonnet',
    },
    prompts: ['Run `echo hi` with the Bash tool, then reply: done.'],
    before: async (query) => (await query.initializationResult()).output_style,
  });
  return {
    outputStyle: run.extra,
    hookFired: run.seen.preToolUse.length > 0,
    effort: run.seen.preToolUse[0]?.effort ?? null,
  };
}

/** 10 · Where the CLI reads `.mcp.json` from: the `cwd` only, or up to the repository's root (D-11). */
/** @type {Probe} */
async function locations(sdk, world) {
  const repository = makeRepository(world.root, 'locations-repo');
  fs.mkdirSync(path.join(repository, '.git'));
  const sub = path.join(repository, 'sub');
  fs.mkdirSync(sub);
  const run = await session(sdk, {
    cwd: sub,
    config: world.config,
    options: { strictMcpConfig: false },
    before: (query) => settledStatus(query),
  });
  return {
    fromSubdirectory: run.extra
      .filter((/** @type {any} */ s) => s.source === 'project')
      .map((/** @type {any} */ s) => s.name),
  };
}

const RUNNERS = { strict, approval, secret, probe, project, shell, skills, flags, locations };

// ---------------------------------------------------------------------------------------------

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-claude-config-spike-'));
const world = { root, config: makeConfig(root) };

try {
  process.exitCode = await runSpike({
    args: process.argv.slice(2),
    probes: PROBES,
    heading: 'Plan 13 · B-01 — the measurements behind "Configuração do Claude"',
    root: repoRoot,
    probe: (sdk, name) => RUNNERS[/** @type {keyof typeof RUNNERS} */ (name)](sdk, world),
    report: (results) => reportTable(spikeRows(results)),
    say: { info, ok, fail, title, line },
  });
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
