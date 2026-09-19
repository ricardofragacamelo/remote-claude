#!/usr/bin/env node
/**
 * `e2e/smoke-live/` — the only suite that talks to the real Claude.
 *
 * Everything under `e2e/specs/` runs against a **replay** of a recorded run: an end-to-end test
 * has to be deterministic and Claude is not, and each real run costs money. That is the rule of
 * docs/architecture/shared/06-testing-strategy.md, and this is its one exception.
 *
 * What it exists to catch is the thing nothing else can: **the SDK changing its contract under
 * us**. A variant of `SDKMessage` added by a release, a `canUseTool` that stops being called, a
 * field that moves. The fake cannot notice any of that, because the fake is what we believe.
 *
 * **It is not a gate.** It is run on demand ([D-12](../docs/plans/01-live-session/decisions.md)),
 * it needs a Claude logged in on this machine, and a failure here opens an issue rather than
 * blocking a merge — a flake on the critical path teaches everybody to ignore a red build.
 *
 * It is three lines of its own and a delegation on purpose: the ephemeral stack, the random
 * ports, the unique compose project and the teardown are all `run-e2e-local.mjs`'s, and a second
 * implementation of any of them is a second place for a container to be left behind.
 *
 * Usage: `pnpm test:e2e:live` — other arguments go to Playwright.
 */

import path from 'node:path';
import process from 'node:process';

import fs from 'node:fs';
import os from 'node:os';

import { runAttached } from './lib/exec.mjs';
import { repoRoot } from './lib/paths.mjs';
import { fail, hint } from './lib/ui.mjs';

/** How long the whole thing gets: the stack, plus real turns of a real model. */
const TIMEOUT_MS = 1_800_000;

/**
 * Where the CLI keeps the login this backend inherits.
 *
 * There is deliberately no variable for the Claude credential — the backend runs as the owner of
 * the machine and uses what `claude` already stored. See
 * docs/discovery/01-descoberta-claude-agent-sdk.md.
 */
const CREDENTIAL = path.join(
  process.env['CLAUDE_CONFIG_DIR'] ?? path.join(os.homedir(), '.claude'),
  '.credentials.json',
);

/**
 * Refuses to start without a Claude to talk to.
 *
 * A missing login would otherwise show up as a session that fails to open, minutes into the run
 * and with a message about a subprocess. Saying so here costs one `existsSync` and saves the
 * confusion — and on macOS, where the credential lives in the keychain instead, the check simply
 * finds nothing and the run goes ahead.
 *
 * @returns {boolean}
 */
function claudeIsLoggedIn() {
  return fs.existsSync(CREDENTIAL) || process.platform === 'darwin';
}

function main() {
  if (!claudeIsLoggedIn()) {
    fail('there is no Claude logged in on this machine');
    hint('run `claude` once and sign in — the backend inherits that login, by design');
    hint('docs/discovery/01-descoberta-claude-agent-sdk.md');
    return 1;
  }

  // Attached, because the interesting output of a live run is what it prints while it is running:
  // a real turn takes minutes, and a script that swallowed it until the end would look hung.
  return runAttached(
    process.execPath,
    [path.join(repoRoot, 'scripts/run-e2e-local.mjs'), '--live', ...process.argv.slice(2)],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  ).code;
}

process.exitCode = main();
