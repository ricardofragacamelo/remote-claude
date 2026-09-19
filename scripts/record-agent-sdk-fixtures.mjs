#!/usr/bin/env node
/**
 * Records the Agent SDK's real output as fixtures.
 *
 * The fake in `backend/test/fakes/agent-sdk/` replays these files. It exists because without a
 * deterministic stream there is no integration test, no e2e and no honest coverage of
 * `adapter/outbound/claude/` — and because a fake written from memory proves only that the fake
 * works, which is exactly the risk this tool removes
 * (docs/plans/01-live-session/decisions.md#d-04).
 *
 * It runs **on demand**, like the live smoke test: it needs the Claude CLI logged in on this
 * machine, it spends quota, and it talks to the network. It is not a gate.
 *
 * Every run happens in a throwaway directory under the system temp, never in this repository:
 * the scenarios ask Claude to write files, and a scenario that wrote into the working tree would
 * be a recording tool with a side effect nobody asked for.
 *
 * Usage:
 *   pnpm fixtures:record             # every scenario
 *   pnpm fixtures:record text-turn   # one of them, by name
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { repoRoot } from './lib/paths.mjs';
import { bold, dim, fail, info, ok, title, warn } from './lib/ui.mjs';

/** Where the fake reads them from. */
const FIXTURES_DIR = path.join(repoRoot, 'backend', 'test', 'fakes', 'agent-sdk', 'fixtures');

/** How long one scenario may take before it is abandoned. A turn with tools is not fast. */
const SCENARIO_TIMEOUT_MS = 240_000;

/**
 * What gets recorded.
 *
 * Each one exists for a claim the fake has to be able to support. `files` seeds the throwaway
 * workspace so the prompt has something real to act on.
 */
const SCENARIOS = [
  {
    name: 'text-turn',
    why: 'the plainest turn there is: deltas, one completed message, one result',
    prompt: 'Reply with exactly the word: pong. Do not use any tool.',
    files: {},
  },
  {
    name: 'tool-turn',
    why: 'the 6 tool calls → 6 PreToolUse hooks → 2 canUseTool asymmetry the audit trail rests on',
    prompt:
      'Read notes.md, then run `ls` in this directory, then read notes.md again, ' +
      'then write a file called summary.md containing one line summarising notes.md. ' +
      'Work through it step by step and do not ask me anything.',
    files: { 'notes.md': 'The project has two goals: be safe, and be fast.\n' },
  },
];

/** @param {string} message */
function abort(message) {
  fail(message);
  process.exit(1);
}

/**
 * A throwaway workspace, seeded with the scenario's files.
 *
 * @param {Record<string, string>} files
 * @returns {string}
 */
function makeWorkspace(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-fixture-'));

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content, 'utf8');
  }

  return directory;
}

/**
 * Runs one scenario and returns everything that happened.
 *
 * `canUseTool` answers `allow` and records that it was asked. It has to answer something, and
 * denying would record a stream of refusals rather than a stream of work — but **which** tools it
 * was consulted about is the measurement the fixture carries.
 *
 * @param {(params: unknown) => AsyncIterable<unknown> & { close(): void }} query
 * @param {(typeof SCENARIOS)[number]} scenario
 */
async function record(query, scenario) {
  const workspace = makeWorkspace(scenario.files);

  /** @type {unknown[]} */
  const messages = [];
  /** @type {{ toolName: string, input: unknown }[]} */
  const canUseTool = [];
  /** @type {{ toolName: string, toolUseId: string | undefined }[]} */
  const preToolUse = [];
  /** @type {string[]} */
  const stderr = [];

  const prompts = (async function* stream() {
    yield {
      type: 'user',
      message: { role: 'user', content: scenario.prompt },
      parent_tool_use_id: null,
    };
  })();

  const abortController = new AbortController();
  const deadline = setTimeout(() => abortController.abort(), SCENARIO_TIMEOUT_MS);

  const session = query({
    prompt: prompts,
    options: {
      cwd: workspace,
      // The same value the product runs with, and for the same reason: omitting it loads the
      // user's own `allow` rules and skips `canUseTool` in silence.
      settingSources: ['project'],
      hooks: {
        PreToolUse: [
          {
            hooks: [
              /** @param {{ tool_name?: string }} input @param {string | undefined} toolUseId */
              (input, toolUseId) => {
                preToolUse.push({ toolName: input.tool_name ?? 'unknown', toolUseId });
                return Promise.resolve({ continue: true });
              },
            ],
          },
        ],
      },
      /**
       * @param {string} toolName
       * @param {Record<string, unknown>} input
       */
      canUseTool: (toolName, input) => {
        canUseTool.push({ toolName, input });
        return Promise.resolve({ behavior: 'allow', updatedInput: input });
      },
      includePartialMessages: true,
      includeHookEvents: true,
      allowDangerouslySkipPermissions: false,
      maxTurns: 20,
      abortController,
      /** @param {string} data */
      stderr: (data) => stderr.push(data),
    },
  });

  try {
    for await (const message of session) {
      messages.push(message);
    }
  } finally {
    clearTimeout(deadline);
    session.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  return { messages, canUseTool, preToolUse, stderr };
}

/**
 * Rewrites the throwaway workspace path out of a recording.
 *
 * The path contains the machine's temp directory and a random suffix, so leaving it in would make
 * every recording differ from every other for a reason that has nothing to do with the SDK.
 *
 * @param {unknown} value
 * @param {string} workspace
 * @returns {unknown}
 */
function normalise(value, workspace) {
  return JSON.parse(
    JSON.stringify(value).split(JSON.stringify(workspace).slice(1, -1)).join('/workspace'),
  );
}

/**
 * The version of the SDK these recordings came from. A fixture without it ages invisibly.
 *
 * Found by walking up from the resolved entry point rather than by resolving `package.json`
 * directly: the package's `exports` map does not publish it, and asking for a subpath a package
 * chose not to export is a resolution error, not a missing file.
 */
function sdkVersion() {
  const fromBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'));
  let directory = path.dirname(fromBackend.resolve('@anthropic-ai/claude-agent-sdk'));

  for (;;) {
    const manifest = path.join(directory, 'package.json');

    if (fs.existsSync(manifest)) {
      return JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      return 'unknown';
    }
    directory = parent;
  }
}

async function main() {
  title('Agent SDK — recording fixtures');

  const wanted = process.argv.slice(2);
  const chosen = wanted.length === 0 ? SCENARIOS : SCENARIOS.filter((s) => wanted.includes(s.name));

  if (chosen.length === 0) {
    abort(
      `no scenario named ${wanted.join(', ')}; known: ${SCENARIOS.map((s) => s.name).join(', ')}`,
    );
  }

  if (!fs.existsSync(path.join(os.homedir(), '.claude', '.credentials.json'))) {
    abort('the Claude CLI is not logged in on this machine; run `claude` once and sign in');
  }

  // Resolved from the backend package rather than from here: the SDK is a dependency of the
  // backend, and the one rule that matters about it is that nothing outside
  // `backend/src/adapter/outbound/claude/` imports it. A root dependency would make that rule
  // harder to see and this script's presence in `scripts/` harder to justify.
  const fromBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'));
  const sdk = await import(
    pathToFileURL(fromBackend.resolve('@anthropic-ai/claude-agent-sdk')).href
  );

  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  for (const scenario of chosen) {
    info(`${bold(scenario.name)} — ${dim(scenario.why)}`);

    const started = Date.now();
    const workspace = makeWorkspace({});
    fs.rmSync(workspace, { recursive: true, force: true });

    let result;
    try {
      result = await record(sdk.query, scenario);
    } catch (error) {
      fail(`${scenario.name} failed`, String(error));
      process.exitCode = 1;
      continue;
    }

    // The `system:init` message is the only one that reports the working directory, and it is
    // what the throwaway path is normalised out of.
    const init = /** @type {{ cwd?: string } | undefined} */ (
      result.messages.find((m) => m !== null && typeof m === 'object' && 'cwd' in m)
    );
    const cwd = String(init?.cwd ?? '');

    const fixture = {
      $comment:
        'Recorded by scripts/record-agent-sdk-fixtures.mjs from a real Agent SDK run. ' +
        'Do not edit by hand — re-record instead. See docs/plans/01-live-session/F2-session-runtime.md.',
      name: scenario.name,
      why: scenario.why,
      prompt: scenario.prompt,
      recordedAt: new Date().toISOString().slice(0, 10),
      sdkVersion: sdkVersion(),
      counts: {
        messages: result.messages.length,
        preToolUse: result.preToolUse.length,
        canUseTool: result.canUseTool.length,
      },
      preToolUse: normalise(result.preToolUse, cwd),
      canUseTool: normalise(result.canUseTool, cwd),
      stderr: result.stderr,
      messages: normalise(result.messages, cwd),
    };

    const file = path.join(FIXTURES_DIR, `${scenario.name}.json`);
    fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

    ok(
      scenario.name,
      `${String(fixture.counts.messages)} messages · ${String(fixture.counts.preToolUse)} hooks · ` +
        `${String(fixture.counts.canUseTool)} canUseTool · ${String(Date.now() - started)}ms`,
    );
  }

  if (chosen.some((s) => s.name === 'tool-turn')) {
    warn(
      'the tool-turn counts are a measurement, not a target',
      'if hooks and canUseTool no longer differ, the assumption behind the audit trail changed',
    );
  }
}

await main();
