#!/usr/bin/env node
/**
 * The B-01 spike of plan 27: the ten questions of the D-05, measured against the real Claude
 * (docs/plans/27-conversation-losses/F0-spike.md#b-01-).
 *
 *   node scripts/conversation-losses-spike.mjs [probe…] [--json <file>]
 *
 * Probes: `systemMessages`, `hookMessage`, `fallbackModel`, `rateLimit`, `apiRetry`,
 * `conversationReset`, `workerShutdown`, `retraction`, `strayBlock`, `compactChain` — with no name,
 * every one runs. Three of them (`fallbackModel`, `workerShutdown`, `retraction`) cannot be provoked
 * on purpose against the real CLI — an overload, a worker's own graceful teardown, and a model
 * refusal are not events a spike can ask for — so they answer from what the SDK's own type
 * declarations say, the same treatment the D-09 fixture gives the refusal-fallback case, and cost no
 * quota. The rest open at most three sessions against the real Claude (`systemMessages`,
 * `hookMessage`, `strayBlock`, `compactChain` and `rateLimit` share one; `conversationReset` and
 * `apiRetry` each open their own), memoised so asking for several still opens each session once.
 *
 * Like the spikes of plans 13 and 26, it never touches the user's `~/.claude`: every session gets a
 * throwaway `CLAUDE_CONFIG_DIR` with the credential **copied**, and a repository of its own. Every
 * session but `apiRetry`'s carries the product's options: `settingSources: ['project']`, the
 * `PreToolUse` hook and `canUseTool`.
 *
 * The output is a Markdown table and, with `--json`, every raw number. Exits 0 when every probe ran
 * — a probe whose answer is "the CLI does not do this" is a result, not a failure.
 */

import process from 'node:process';

import {
  apiRetryMessages,
  compactBoundaryMessage,
  conversationResetMessage,
  HOOK_SYSTEM_MESSAGE,
  hookSystemMessageLocation,
  rateLimitShape,
  repositoryFiles,
  spikeRows,
  strayBlocksBesideToolResult,
  systemSubtypes,
  TOOL_PROMPT,
} from './lib/conversation-losses-spike.mjs';
import { reportTable } from './lib/claude-config-spike.mjs';
import {
  makeThrowawayWorld,
  runInWorld,
  runNamedSpike,
  withConfigDir,
} from './lib/spike-session.mjs';

/** The model the turns run on: cheap, and enough for a tool call and a slash command. */
const MODEL = process.env['SPIKE_MODEL'] ?? 'haiku';

/**
 * One throwaway session, opened and torn down around `read` — the shape `systemMessages`,
 * `apiRetry` and `conversationReset` each need, with their own world and their own prompts.
 *
 * @param {any} sdk @param {string} name @param {Record<string, string>} files
 * @param {{ prompts: string[], timeoutMs: number, env?: Record<string, string>, options?: Record<string, unknown> }} session
 * @param {(run: any, world: { config: string, repository: string }) => Promise<unknown> | unknown} read
 */
function openSession(sdk, name, files, session, read) {
  return runInWorld(makeThrowawayWorld(name, files), sdk, { model: MODEL, ...session }, read);
}

const PROBES = [
  'systemMessages',
  'hookMessage',
  'fallbackModel',
  'rateLimit',
  'apiRetry',
  'conversationReset',
  'workerShutdown',
  'retraction',
  'strayBlock',
  'compactChain',
];

/** One answer that needs no session: the SDK's own `.d.ts` is the measurement (see file header). */
const NOT_PROVOCABLE = {
  fallbackModel:
    'não provocável de propósito (uma sobrecarga real não se força). O sdk.d.ts não declara ' +
    'nenhum subtipo de "troca de modelo por sobrecarga": só model_refusal_fallback/' +
    'model_refusal_no_fallback, e os dois disparam por trigger: "refusal", nunca por sobrecarga — a ' +
    'troca pela opção fallbackModel não tem aviso próprio',
  workerShutdown:
    'não observável pela SDK local: o comentário do tipo diz que é "emitted by the bridge on ' +
    'opt-in graceful worker teardown" — um caminho do hospedeiro de um backend hospedado, que o ' +
    '`query()` local que este produto usa não aciona. `close()` da sessão não aceita motivo',
  retraction:
    'não provocável de propósito, pela mesma razão da D-09 (recusa com modelo de reserva). O ' +
    'sdk.d.ts documenta a forma: "one uuid per normalized SDK message; multi-block messages carry ' +
    'per-block derived uuids" — por bloco, não por mensagem inteira, o que sugere compatibilidade ' +
    'com um blockId nosso, mas sem medição ao vivo para confirmar',
};

/** Builds the main session once, however many of its probes are asked for. */
let mainPromise = null;

/** @param {any} sdk */
function main(sdk) {
  mainPromise ??= runMain(sdk);
  return mainPromise;
}

/** @param {any} sdk */
function runMain(sdk) {
  return openSession(
    sdk,
    'losses-main',
    repositoryFiles(),
    {
      prompts: [TOOL_PROMPT, '/compact'],
      timeoutMs: 150_000,
      // Without it, the project's own PreToolUse hook still runs but never reaches the stream at
      // all — no hook_started/hook_progress/hook_response, and no informational either — which is
      // exactly what the first B-01 run measured before this option was added (D-04, probe 2).
      options: { includeHookEvents: true },
    },
    async (run, world) => {
      const withoutStart = Date.now();
      const without = await withConfigDir(world.config, () =>
        sdk.getSessionMessages(run.sessionId, { dir: world.repository }),
      );
      const withoutMs = Date.now() - withoutStart;

      const withStart = Date.now();
      const withSystem = await withConfigDir(world.config, () =>
        sdk.getSessionMessages(run.sessionId, {
          dir: world.repository,
          includeSystemMessages: true,
        }),
      );
      const withMs = Date.now() - withStart;

      return { run, without, withSystem, withoutMs, withMs };
    },
  );
}

/** 1 · includeSystemMessages: subtypes and cost. */
async function systemMessages(/** @type {any} */ sdk) {
  const { without, withSystem, withoutMs, withMs } = await main(sdk);
  return {
    withoutCount: without.length,
    withoutMs,
    withCount: withSystem.length,
    withMs,
    subtypes: systemSubtypes(withSystem),
  };
}

/** 2 · Where a settings hook's `systemMessage` turns up. */
async function hookMessage(/** @type {any} */ sdk) {
  const { run } = await main(sdk);
  return { location: hookSystemMessageLocation(run.messages, HOOK_SYSTEM_MESSAGE) };
}

/** 3 · The overload fallback — answered from the schema; see {@link NOT_PROVOCABLE}. */
function fallbackModel() {
  return Promise.resolve({ answer: NOT_PROVOCABLE.fallbackModel });
}

/** 4 · `rate_limit_info`, observed opportunistically on the main session. */
async function rateLimit(/** @type {any} */ sdk) {
  const { run } = await main(sdk);
  return rateLimitShape(run.messages);
}

/** 5 · `api_retry` under a connection the API can never answer — no quota spent. */
function apiRetry(/** @type {any} */ sdk) {
  return openSession(
    sdk,
    'losses-apiretry',
    {},
    {
      prompts: ['Reply with exactly: pong.'],
      timeoutMs: 30_000,
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1' },
    },
    (run) => apiRetryMessages(run.messages),
  );
}

/** 6 · `/clear`: a `conversation_reset`, and whether `session_id` changes with it. */
function conversationReset(/** @type {any} */ sdk) {
  return openSession(
    sdk,
    'losses-reset',
    {},
    {
      prompts: ['Reply with exactly the word: one. Do not use any tool.', '/clear'],
      timeoutMs: 90_000,
    },
    (run) => {
      const message = conversationResetMessage(run.messages);
      const first = run.messages[0]?.session_id ?? null;
      const last = run.messages.at(-1)?.session_id ?? null;
      return { message, sessionIdChanged: first !== null && last !== null && first !== last };
    },
  );
}

/** 7 · `worker_shutting_down` — answered from the schema; see {@link NOT_PROVOCABLE}. */
function workerShutdown() {
  return Promise.resolve({ answer: NOT_PROVOCABLE.workerShutdown });
}

/** 8 · The retraction's uuids against a blockId/messageId — answered from the schema; see {@link NOT_PROVOCABLE}. */
function retraction() {
  return Promise.resolve({ answer: NOT_PROVOCABLE.retraction });
}

/** 9 · A block beside a `tool_result` in the same message. */
async function strayBlock(/** @type {any} */ sdk) {
  const { run } = await main(sdk);
  return strayBlocksBesideToolResult(run.messages);
}

/** 10 · The `compact_boundary` chain, live and in the history read back with `includeSystemMessages`. */
async function compactChain(/** @type {any} */ sdk) {
  const { run, withSystem } = await main(sdk);
  return {
    boundary: compactBoundaryMessage(run.messages),
    inHistory: compactBoundaryMessage(withSystem) !== null,
  };
}

process.exitCode = await runNamedSpike({
  args: process.argv.slice(2),
  probes: PROBES,
  heading: 'Plan 27 · B-01 — the ten questions of the D-05, measured',
  runners: {
    systemMessages,
    hookMessage,
    fallbackModel,
    rateLimit,
    apiRetry,
    conversationReset,
    workerShutdown,
    retraction,
    strayBlock,
    compactChain,
  },
  reportOf: (results) => reportTable(spikeRows(results)),
});
