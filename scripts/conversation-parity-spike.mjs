#!/usr/bin/env node
/**
 * The B-01 spike of plan 26: the shapes the app's conversation rests on, measured against the real
 * Claude (docs/plans/26-mobile-conversation-parity/F0-spike.md#b-01).
 *
 *   node scripts/conversation-parity-spike.mjs [probe…] [--json <file>]
 *
 * Probes: `subagent`, `mcp`, `blocks` — with no name, every one runs. Each costs one small turn of
 * quota. The same three are what the `smoke-live` checks again on every version of the CLI (B-31).
 *
 * Like the spike of plan 13, it never touches the user's `~/.claude`: every run gets a
 * `CLAUDE_CONFIG_DIR` of its own, under a throwaway root, with the credential **copied** into it,
 * and a repository generated per run. The MCP server is the fixture of plan 13
 * (`e2e/fixtures/mcp-server/`), handed **directly** to the session with `strictMcpConfig`, because the
 * composition of plan 13 does not exist yet. Every session has the product's options:
 * `settingSources: ['project']`, the `PreToolUse` hook, `canUseTool`, the partial messages, the
 * forwarded subagent text and the summarised thinking.
 *
 * The output is a Markdown table and, with `--json`, every raw number. Exits 0 when every probe ran.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { fixtureServer, placed, reportTable } from './lib/claude-config-spike.mjs';
import {
  blocksShape,
  MCP_SERVER,
  mcpShape,
  PROMPTS,
  repositoryFiles,
  spikeRows,
  subagentHistoryShape,
  subagentShape,
} from './lib/conversation-parity-spike.mjs';
import { repoRoot } from './lib/paths.mjs';
import { copyCredential, runSpike, spikeSession } from './lib/spike-session.mjs';
import { fail, info, line, ok, title } from './lib/ui.mjs';

const SERVER = path.join(repoRoot, 'e2e', 'fixtures', 'mcp-server', 'fixture-mcp-server.mjs');

/** The model the turns run on: cheap, and enough to delegate and call a named tool. */
const MODEL = process.env['SPIKE_MODEL'] ?? 'haiku';

const PROBES = ['subagent', 'mcp', 'blocks'];

/** The product's options that shape what the stream carries (sdk-options.factory.ts). */
const PRODUCT_STREAM = {
  includePartialMessages: true,
  includeHookEvents: true,
  forwardSubagentText: true,
  persistSession: true,
  thinking: { type: 'adaptive', display: 'summarized' },
};

/**
 * A throwaway root: the isolated configuration, with the credential copied, and a repository.
 *
 * @param {string} name
 */
function makeWorld(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `rc-parity-spike-${name}-`));
  const source = process.env['CLAUDE_CONFIG_DIR'] ?? path.join(os.homedir(), '.claude');
  const config = path.join(root, 'config');
  fs.mkdirSync(config);
  copyCredential(source, config);

  const repository = path.join(root, 'repository');
  for (const [target, content] of placed(repository, repositoryFiles())) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return { root, config, repository };
}

/**
 * One turn of a probe, in a world of its own, with the product's stream options.
 *
 * @param {any} sdk @param {string} name @param {Record<string, unknown>} [options]
 * @param {(run: any, world: { config: string, repository: string }) => Promise<unknown>} read
 */
async function probe(sdk, name, read, options = {}) {
  const world = makeWorld(name);
  try {
    const run = await spikeSession(sdk, {
      cwd: world.repository,
      config: world.config,
      model: MODEL,
      prompts: [PROMPTS[/** @type {keyof typeof PROMPTS} */ (name)]],
      options: { ...PRODUCT_STREAM, ...options },
    });
    return await read(run, world);
  } finally {
    fs.rmSync(world.root, { recursive: true, force: true });
  }
}

/**
 * What the store kept of a run, read the way the backend reads it — with the configuration of the
 * run, since the store lives under it.
 *
 * @param {any} sdk @param {string} sessionId @param {{ config: string, repository: string }} world
 */
async function storedRun(sdk, sessionId, world) {
  const previous = process.env['CLAUDE_CONFIG_DIR'];
  process.env['CLAUDE_CONFIG_DIR'] = world.config;
  try {
    const options = { dir: world.repository };
    const main = await sdk.getSessionMessages(sessionId, options);
    const agents = await sdk.listSubagents(sessionId, options);
    const subagents = [];
    for (const agentId of agents) {
      subagents.push(await sdk.getSubagentMessages(sessionId, agentId, options));
    }
    return { main, subagents };
  } finally {
    if (previous === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
    else process.env['CLAUDE_CONFIG_DIR'] = previous;
  }
}

/** 1 · A subagent of the project that writes, asking — live and from the history (S-05). */
async function subagent(/** @type {any} */ sdk) {
  return probe(sdk, 'subagent', async (run, world) => {
    const live = subagentShape(run.messages, run.seen);
    const agentCall = run.messages
      .flatMap((/** @type {any} */ message) => message.message?.content ?? [])
      .find((/** @type {any} */ block) => block?.type === 'tool_use' && block.name === 'Agent');
    const stored = await storedRun(sdk, run.sessionId, world);
    return {
      live,
      history: subagentHistoryShape(stored.main, stored.subagents, agentCall?.id ?? null),
    };
  });
}

/** 2 · A tool of an MCP server, called with no title (S-48). */
async function mcp(/** @type {any} */ sdk) {
  return probe(sdk, 'mcp', async (run) => mcpShape(run.messages, run.seen), {
    mcpServers: {
      [MCP_SERVER]: fixtureServer({ node: process.execPath, server: SERVER, name: MCP_SERVER }),
    },
  });
}

/** 3 · Text, a tool and text again in one answer (S-27). */
async function blocks(/** @type {any} */ sdk) {
  return probe(sdk, 'blocks', async (run) => blocksShape(run.messages));
}

const RUNNERS = { subagent, mcp, blocks };

process.exitCode = await runSpike({
  args: process.argv.slice(2),
  probes: PROBES,
  heading: 'Plan 26 · B-01 — the shapes of the conversation, measured',
  root: repoRoot,
  probe: (sdk, name) => RUNNERS[/** @type {keyof typeof RUNNERS} */ (name)](sdk),
  report: (results) => reportTable(spikeRows(results)),
  say: { info, ok, fail, title, line },
});
