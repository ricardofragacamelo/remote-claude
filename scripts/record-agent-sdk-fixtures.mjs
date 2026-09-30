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
 * Two kinds of recording. A **turn** sends one prompt and keeps everything the stream, the hooks and
 * `canUseTool` produced. The **catalogue** sends no prompt at all: it opens the `query()`, asks
 * `supportedCommands()` and closes — which costs no quota, because nothing is ever said to the model.
 *
 * Usage:
 *   pnpm fixtures:record               # every scenario
 *   pnpm fixtures:record text-turn     # one of them, by name
 *   pnpm fixtures:record --normalise   # re-apply the normalisation to what is committed, no SDK
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import * as prettier from 'prettier';

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
  {
    name: 'init-turn',
    why: '`/init` sent as a prompt runs the command, and its `Write` asks through canUseTool',
    prompt: '/init',
    files: {
      'README.md': '# Tally\n\nCounts words in a file.\n',
      'tally.js':
        "const fs = require('fs');\nconsole.log(fs.readFileSync(process.argv[2], 'utf8').split(/\\s+/).length);\n",
    },
  },
  {
    name: 'cwd-turn',
    why: 'Claude names the directory it runs in — what proves, through the door a person uses, that a session runs in the folder of its tab (plan 06, S-156)',
    prompt:
      'Reply with only the absolute path of your current working directory, on one line, ' +
      'and nothing else. Do not use any tool.',
    files: {},
  },
];

/**
 * What the catalogue recording asks for: the commands of the installation, with no prompt.
 *
 * The same `settingSources` the product runs with — the list depends on it (54 commands with
 * `['project']`, 57 with the default, measured), and a fixture taken under different settings would
 * be a list of some other installation.
 */
const CATALOGUE = {
  name: 'commands',
  why: 'what supportedCommands() answers, dead and internal entries included — the menu filters them by metadata',
};

/**
 * Writes a fixture the way `pnpm format:check` expects it.
 *
 * `JSON.stringify` expands every array, and Prettier folds the short ones back onto one line — a
 * fixture written raw fails gate 1 the moment it is recorded again.
 *
 * @param {string} file
 * @param {unknown} fixture
 */
async function writeFixture(file, fixture) {
  const options = (await prettier.resolveConfig(file)) ?? {};
  const text = await prettier.format(JSON.stringify(fixture), { ...options, filepath: file });

  fs.writeFileSync(file, text, 'utf8');
}

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
 * Asks the installation for its slash commands, and says nothing to the model.
 *
 * The prompt iterable never yields: `supportedCommands()` is answered from the initialisation of the
 * subprocess, and a prompt would spend quota to learn nothing more.
 *
 * @param {(params: unknown) => { supportedCommands(): Promise<unknown[]>, close(): void }} query
 */
async function recordCatalogue(query) {
  const workspace = makeWorkspace({});
  // An iterable whose first `next()` never settles: the CLI waits for a prompt that never comes.
  const idle = { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }) };

  const session = query({
    prompt: idle,
    options: {
      cwd: workspace,
      settingSources: ['project'],
      hooks: { PreToolUse: [{ hooks: [() => Promise.resolve({ continue: true })] }] },
      canUseTool: () => Promise.resolve({ behavior: 'deny', message: 'recording the catalogue' }),
      allowDangerouslySkipPermissions: false,
    },
  });

  try {
    return await session.supportedCommands();
  } finally {
    session.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

/**
 * Rewrites what belongs to this machine out of a recording.
 *
 * The throwaway path contains the temp directory and a random suffix, and the CLI writes it twice:
 * as a path, and as the **slug** it names its per-project folders with (`/tmp/rc-fixture-x` →
 * `-tmp-rc-fixture-x`, under the user's home). Left in, every recording would differ from every
 * other for a reason that has nothing to do with the SDK — and the home directory of whoever
 * recorded it would be committed to the repository.
 *
 * Fragments of the path inside a streamed delta are cut wherever the model's tokens fell and are
 * left as they are: rewriting half a token would make the deltas stop adding up to the message they
 * stream.
 *
 * @param {unknown} value
 * @param {string} workspace
 * @returns {unknown}
 */
function normalise(value, workspace) {
  const exact = JSON.stringify(value)
    .split(JSON.stringify(workspace).slice(1, -1))
    .join('/workspace')
    .split(slugOf(workspace))
    .join('-workspace');

  return JSON.parse(anonymised(exact));
}

/**
 * The folder name the CLI gives a project directory: every non-alphanumeric character a dash.
 *
 * @param {string} directory
 * @returns {string}
 */
function slugOf(directory) {
  return directory.replace(/[^A-Za-z0-9]/g, '-');
}

/** Any throwaway directory of this recorder, as a path or as a slug. */
const THROWAWAY = /\/tmp\/rc-fixture-[A-Za-z0-9]{6}/g;
const THROWAWAY_SLUG = /-tmp-rc-fixture-[A-Za-z0-9]{6}/g;

/**
 * The rules that need no knowledge of which run produced the text: any throwaway directory of this
 * recorder, and the home directory of the machine.
 *
 * @param {string} text
 * @returns {string}
 */
function anonymised(text) {
  return text
    .replace(THROWAWAY, '/workspace')
    .replace(THROWAWAY_SLUG, '-workspace')
    .split(os.homedir())
    .join('/home/user');
}

/**
 * Applies the rules to the fixtures already committed, without running the SDK — for a rule added
 * after they were recorded. It spends no quota, and it changes nothing the SDK said.
 */
async function normaliseCommitted() {
  title('Agent SDK — normalising the recorded fixtures');

  for (const file of fs.readdirSync(FIXTURES_DIR).filter((name) => name.endsWith('.json'))) {
    const full = path.join(FIXTURES_DIR, file);
    const before = fs.readFileSync(full, 'utf8');

    await writeFixture(full, JSON.parse(anonymised(JSON.stringify(JSON.parse(before)))));
    ok(file, fs.readFileSync(full, 'utf8') === before ? 'unchanged' : 'normalised');
  }
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

/**
 * Records the catalogue and writes it beside the turns.
 *
 * @param {(params: unknown) => { supportedCommands(): Promise<unknown[]>, close(): void }} query
 */
async function writeCatalogue(query) {
  info(`${bold(CATALOGUE.name)} — ${dim(CATALOGUE.why)}`);

  let commands;
  try {
    commands = await recordCatalogue(query);
  } catch (error) {
    fail(`${CATALOGUE.name} failed`, String(error));
    process.exitCode = 1;
    return;
  }

  const fixture = {
    $comment:
      'Recorded by scripts/record-agent-sdk-fixtures.mjs from a real Agent SDK run. ' +
      'Do not edit by hand — re-record instead. See docs/plans/04-transcript-and-resume/F3-commands.md.',
    name: CATALOGUE.name,
    why: CATALOGUE.why,
    recordedAt: new Date().toISOString().slice(0, 10),
    sdkVersion: sdkVersion(),
    counts: { commands: commands.length },
    commands,
  };

  await writeFixture(path.join(FIXTURES_DIR, `${CATALOGUE.name}.json`), fixture);

  ok(CATALOGUE.name, `${String(commands.length)} commands`);
}

/**
 * Records one scenario and writes its fixture, or reports why it could not — which fails the run
 * without stopping the scenarios after it.
 *
 * @param {(params: unknown) => AsyncIterable<unknown> & { close(): void }} query
 * @param {(typeof SCENARIOS)[number]} scenario
 */
async function recordScenario(query, scenario) {
  info(`${bold(scenario.name)} — ${dim(scenario.why)}`);

  const started = Date.now();
  const workspace = makeWorkspace({});
  fs.rmSync(workspace, { recursive: true, force: true });

  let result;
  try {
    result = await record(query, scenario);
  } catch (error) {
    fail(`${scenario.name} failed`, String(error));
    process.exitCode = 1;
    return;
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

  await writeFixture(path.join(FIXTURES_DIR, `${scenario.name}.json`), fixture);

  ok(
    scenario.name,
    `${String(fixture.counts.messages)} messages · ${String(fixture.counts.preToolUse)} hooks · ` +
      `${String(fixture.counts.canUseTool)} canUseTool · ${String(Date.now() - started)}ms`,
  );
}

async function main() {
  if (process.argv.includes('--normalise')) {
    await normaliseCommitted();
    return;
  }

  title('Agent SDK — recording fixtures');

  const wanted = process.argv.slice(2);
  const chosen = wanted.length === 0 ? SCENARIOS : SCENARIOS.filter((s) => wanted.includes(s.name));
  const catalogue = wanted.length === 0 || wanted.includes(CATALOGUE.name);

  if (chosen.length === 0 && !catalogue) {
    const known = [...SCENARIOS.map((s) => s.name), CATALOGUE.name];
    abort(`no scenario named ${wanted.join(', ')}; known: ${known.join(', ')}`);
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
    await recordScenario(sdk.query, scenario);
  }

  if (catalogue) {
    await writeCatalogue(sdk.query);
  }

  if (chosen.some((s) => s.name === 'tool-turn')) {
    warn(
      'the tool-turn counts are a measurement, not a target',
      'if hooks and canUseTool no longer differ, the assumption behind the audit trail changed',
    );
  }
}

await main();
