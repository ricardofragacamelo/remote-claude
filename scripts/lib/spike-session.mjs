/**
 * One session of a spike against the real Claude, opened the way the product opens one.
 *
 * The spikes of plan 13 (`claude-config-spike.mjs`) and plan 26 (`conversation-parity-spike.mjs`)
 * measure what the CLI does **under the product's options**: `settingSources: ['project']`, the
 * `PreToolUse` hook and `canUseTool`, MCP isolated by `strictMcpConfig`. A measurement taken under
 * other options would be of some other product, so both drive their sessions through this one
 * function rather than each keeping a copy that drifts.
 *
 * The SDK is a parameter, imported by the caller from the backend: this module never loads it, which
 * is what lets its tests run with a fake.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { withoutParentSession } from './parent-session.mjs';

/** How long one session may take before it is abandoned. */
export const SESSION_TIMEOUT_MS = 240_000;

/**
 * What the `PreToolUse` hook saw of one call.
 *
 * @typedef {object} HookSighting
 * @property {string} toolName
 * @property {string | null} toolUseId
 * @property {string | null} permissionMode
 * @property {string | null} agentType
 * @property {string | null} agentId
 * @property {string | null} effort
 */

/**
 * What `canUseTool` was asked about one call.
 *
 * @typedef {object} PermissionSighting
 * @property {string} toolName
 * @property {string | null} toolUseId
 * @property {string | null} agentId the subagent that asked, when one did
 */

/**
 * @typedef {object} SessionSpec
 * @property {string} cwd
 * @property {string} config the `CLAUDE_CONFIG_DIR`
 * @property {string} model what the turns run on
 * @property {Record<string, unknown>} [options] beyond the product's own
 * @property {string[]} [prompts] one turn each; none is an idle session
 * @property {(toolName: string) => boolean} [allows] what `canUseTool` answers — allow by default
 * @property {Record<string, string>} [env] added to the CLI's environment
 * @property {((hookInput: any) => unknown) | undefined} [hookAnswer] what the `PreToolUse` hook
 *   answers — let through by default
 * @property {(query: any, sessionId: string) => Promise<any>} [before] runs once the subprocess
 *   is up and before the first prompt — the control requests of an idle probe
 * @property {number} [timeoutMs] how long before the session is abandoned
 */

/** What the hook input of the CLI says, as a sighting. @param {any} hookInput @returns {HookSighting} */
export function hookSighting(hookInput) {
  return {
    toolName: hookInput.tool_name ?? 'unknown',
    toolUseId: hookInput.tool_use_id ?? null,
    permissionMode: hookInput.permission_mode ?? null,
    agentType: hookInput.agent_type ?? null,
    agentId: hookInput.agent_id ?? null,
    effort: hookInput.effort?.level ?? null,
  };
}

/**
 * What `canUseTool` is told of a call, as a sighting.
 *
 * @param {string} toolName @param {{ toolUseID?: string, agentID?: string } | undefined} options
 * @returns {PermissionSighting}
 */
export function permissionSighting(toolName, options) {
  return { toolName, toolUseId: options?.toolUseID ?? null, agentId: options?.agentID ?? null };
}

/** A promise, and what settles it. */
function deferred() {
  const parts =
    /** @type {{ promise: Promise<unknown>, resolve: (value?: unknown) => void }} */ ({});
  parts.promise = new Promise((resolve) => {
    parts.resolve = resolve;
  });
  return parts;
}

/**
 * Opens a session the way the product does — `settingSources: ['project']`, the `PreToolUse` hook
 * and `canUseTool` — runs `before`, sends the prompts one turn at a time, and closes it.
 *
 * @param {any} sdk @param {SessionSpec} spec
 */
export async function spikeSession(sdk, spec) {
  const sessionId = randomUUID();
  /** @type {{ preToolUse: HookSighting[], canUseTool: PermissionSighting[] }} */
  const seen = { preToolUse: [], canUseTool: [] };
  /** @type {any[]} */
  const messages = [];
  const prompts = spec.prompts ?? [];
  const allows = spec.allows ?? (() => true);

  const ready = deferred();
  let answered = deferred();

  async function* input() {
    await ready.promise;
    for (const text of prompts) {
      answered = deferred();
      yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null };
      await answered.promise;
    }
    // An input that ends closes the session: it waits, for ever, for a prompt that never comes.
    await deferred().promise;
  }

  const abortController = new AbortController();
  const deadline = setTimeout(() => abortController.abort(), spec.timeoutMs ?? SESSION_TIMEOUT_MS);

  const query = sdk.query({
    prompt: input(),
    options: {
      cwd: spec.cwd,
      sessionId,
      model: spec.model,
      // The product's value, and the reason for every spike: omitting it loads the user's personal
      // `allow` rules and skips `canUseTool` in silence.
      settingSources: ['project'],
      hooks: {
        PreToolUse: [
          {
            hooks: [
              /** @param {any} hookInput */
              (hookInput) => {
                seen.preToolUse.push(hookSighting(hookInput));
                return Promise.resolve(spec.hookAnswer?.(hookInput) ?? { continue: true });
              },
            ],
          },
        ],
      },
      /**
       * @param {string} toolName @param {Record<string, unknown>} toolInput
       * @param {{ toolUseID?: string, agentID?: string }} [options]
       */
      canUseTool: (toolName, toolInput, options) => {
        seen.canUseTool.push(permissionSighting(toolName, options));
        return Promise.resolve(
          allows(toolName)
            ? { behavior: 'allow', updatedInput: toolInput }
            : { behavior: 'deny', message: 'refused by the spike' },
        );
      },
      allowDangerouslySkipPermissions: false,
      maxTurns: 8,
      maxBudgetUsd: 1,
      abortController,
      env: { ...withoutParentSession(process.env), CLAUDE_CONFIG_DIR: spec.config, ...spec.env },
      stderr: () => undefined,
      // Isolated unless a probe says otherwise: the product's own setting (ADR-018).
      strictMcpConfig: true,
      mcpServers: {},
      ...spec.options,
    },
  });

  try {
    const extra = spec.before === undefined ? null : await spec.before(query, sessionId);
    ready.resolve();

    let results = 0;
    if (prompts.length > 0) {
      for await (const message of query) {
        messages.push(message);
        if (message.type === 'result') {
          results += 1;
          answered.resolve();
          if (results === prompts.length) break;
        }
      }
    }

    return { sessionId, seen, messages, extra };
  } finally {
    clearTimeout(deadline);
    query.close();
  }
}

/**
 * The SDK, loaded from the backend — the one version the product runs.
 *
 * @param {string} root the repository
 * @returns {Promise<any>}
 */
export async function importAgentSdk(root) {
  const fromBackend = createRequire(path.join(root, 'backend', 'package.json'));
  return import(pathToFileURL(fromBackend.resolve('@anthropic-ai/claude-agent-sdk')).href);
}

/**
 * What a spike was asked to run: the probes named on the command line — every one when none is —,
 * the names it does not know, and where the raw numbers go.
 *
 * @param {readonly string[]} args the command line, after the script
 * @param {readonly string[]} probes the names the spike knows, in order
 */
export function spikeArguments(args, probes) {
  const jsonAt = args.indexOf('--json');
  const jsonFile = jsonAt === -1 ? null : (args[jsonAt + 1] ?? null);
  const wanted = args.filter(
    (arg, index) => !arg.startsWith('--') && (jsonAt === -1 || index !== jsonAt + 1),
  );
  const chosen = wanted.length === 0 ? [...probes] : wanted;

  return { chosen, jsonFile, unknown: chosen.filter((name) => !probes.includes(name)) };
}

/**
 * Runs the chosen probes one at a time, saying how each went. A probe that throws is recorded with
 * its error and the next one runs.
 *
 * @param {readonly string[]} chosen
 * @param {(name: string) => Promise<unknown>} run
 * @param {{ info(text: string): void, ok(text: string, detail?: string): void, fail(text: string, detail?: string): void }} say
 */
export async function runProbes(chosen, run, say) {
  /** @type {Record<string, unknown>} */
  const results = {};
  let failed = 0;

  for (const name of chosen) {
    say.info(`${name}…`);
    const started = Date.now();
    try {
      results[name] = await run(name);
      say.ok(name, `${String(Date.now() - started)} ms`);
    } catch (error) {
      failed += 1;
      results[name] = { error: String(error) };
      say.fail(name, String(error));
    }
  }

  return { results, failed };
}

/**
 * Opens a spike: the probes asked for, or `null` — said — when one of them is not a probe of it.
 *
 * @param {readonly string[]} args the command line, after the script
 * @param {readonly string[]} probes the names the spike knows, in order
 * @param {string} heading what the run is called on screen
 * @param {{ fail(text: string, detail?: string): void, title(text: string): void }} say
 */
export function openSpike(args, probes, heading, say) {
  const parsed = spikeArguments(args, probes);

  if (parsed.unknown.length > 0) {
    say.fail(`no probe named ${parsed.unknown.join(', ')}`, `known: ${probes.join(', ')}`);
    return null;
  }

  say.title(heading);
  return parsed;
}

/**
 * The credential of the machine's Claude, **copied** into an isolated configuration with its own
 * mode — so a spike never shares `.claude.json` with a Claude Code open on the same machine.
 *
 * @param {string} source the configuration it is copied from
 * @param {string} config the isolated one
 */
export function copyCredential(source, config) {
  fs.copyFileSync(path.join(source, '.credentials.json'), path.join(config, '.credentials.json'));
  fs.chmodSync(path.join(config, '.credentials.json'), 0o600);
}

/**
 * A whole spike: the probes asked for on the command line, each run on the SDK of the backend, the
 * raw numbers printed — and written to the `--json` file —, and the report. Exits 0 when every probe
 * ran; a result that is bad for the design is not a failure of the spike.
 *
 * @param {object} spec
 * @param {readonly string[]} spec.args the command line, after the script
 * @param {readonly string[]} spec.probes the names the spike knows, in order
 * @param {string} spec.heading what the run is called on screen
 * @param {string} spec.root the repository — where the SDK is loaded from
 * @param {(sdk: any, name: string) => Promise<unknown>} spec.probe runs one probe
 * @param {(results: Record<string, unknown>) => string} spec.report the table of what it measured
 * @param {{ info(text: string): void, ok(text: string, detail?: string): void, fail(text: string, detail?: string): void, title(text: string): void, line(text: string): void }} spec.say
 * @param {(root: string) => Promise<any>} [spec.loadSdk] how the SDK is loaded — the backend's
 * @returns {Promise<number>} the exit code
 */
export async function runSpike(spec) {
  const opened = openSpike(spec.args, spec.probes, spec.heading, spec.say);
  if (opened === null) {
    return 1;
  }

  const sdk = await (spec.loadSdk ?? importAgentSdk)(spec.root);
  const { results, failed } = await runProbes(
    opened.chosen,
    (name) => spec.probe(sdk, name),
    spec.say,
  );

  spec.say.line(JSON.stringify(results, null, 2));
  if (opened.jsonFile !== null) {
    fs.writeFileSync(opened.jsonFile, `${JSON.stringify(results, null, 2)}\n`);
  }
  spec.say.line(spec.report(results));
  return failed === 0 ? 0 : 1;
}
