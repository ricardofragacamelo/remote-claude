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

import path from 'node:path';
import process from 'node:process';

import { fixtureServer, reportTable } from './lib/claude-config-spike.mjs';
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
import {
  makeThrowawayWorld,
  runInWorld,
  runNamedSpike,
  withConfigDir,
} from './lib/spike-session.mjs';

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
  return makeThrowawayWorld(`parity-${name}`, repositoryFiles());
}

/**
 * One turn of a probe, in a world of its own, with the product's stream options.
 *
 * @param {any} sdk @param {string} name @param {Record<string, unknown>} [options]
 * @param {(run: any, world: { config: string, repository: string }) => Promise<unknown>} read
 */
async function probe(sdk, name, read, options = {}) {
  return runInWorld(
    makeWorld(name),
    sdk,
    {
      model: MODEL,
      prompts: [PROMPTS[/** @type {keyof typeof PROMPTS} */ (name)]],
      options: { ...PRODUCT_STREAM, ...options },
    },
    read,
  );
}

/**
 * What the store kept of a run, read the way the backend reads it — with the configuration of the
 * run, since the store lives under it.
 *
 * @param {any} sdk @param {string} sessionId @param {{ config: string, repository: string }} world
 */
async function storedRun(sdk, sessionId, world) {
  return withConfigDir(world.config, async () => {
    const options = { dir: world.repository };
    const main = await sdk.getSessionMessages(sessionId, options);
    const agents = await sdk.listSubagents(sessionId, options);
    const subagents = [];
    for (const agentId of agents) {
      subagents.push(await sdk.getSubagentMessages(sessionId, agentId, options));
    }
    return { main, subagents };
  });
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

process.exitCode = await runNamedSpike({
  args: process.argv.slice(2),
  probes: PROBES,
  heading: 'Plan 26 · B-01 — the shapes of the conversation, measured',
  runners: { subagent, mcp, blocks },
  reportOf: (results) => reportTable(spikeRows(results)),
});
