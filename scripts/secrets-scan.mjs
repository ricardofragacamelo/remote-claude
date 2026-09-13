#!/usr/bin/env node
/**
 * Runs `gitleaks` over the repository, or over what is staged.
 *
 * This backend runs arbitrary commands on the user's machine; a committed secret is not a
 * formality here (docs/architecture/shared/09-code-quality.md#segurança-estática).
 *
 * The check must never pass by accident: when `gitleaks` is not installed it falls back to the
 * official image — Docker is already a hard requirement of this project — and when neither is
 * available it fails, loudly. A gate that skips itself in silence is not a gate.
 *
 * Usage: `pnpm scan:secrets` · `pnpm scan:secrets --staged` (what the pre-commit hook runs)
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { commandExists, runAttached } from './lib/exec.mjs';
import { fail, hint, info, line, ok, title } from './lib/ui.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'zricethezav/gitleaks:v8.18.4';

const staged = process.argv.includes('--staged');
const scanArgs = staged
  ? ['protect', '--staged', '--no-banner', '--redact', '--verbose']
  : ['detect', '--no-banner', '--redact', '--verbose'];

/**
 * @returns {{ command: string, args: string[] } | null}
 */
function resolveRunner() {
  if (commandExists('gitleaks', ['version'])) {
    return { command: 'gitleaks', args: scanArgs };
  }

  if (commandExists('docker')) {
    return {
      command: 'docker',
      args: [
        'run',
        '--rm',
        '--volume',
        `${repoRoot}:/repo`,
        '--workdir',
        '/repo',
        IMAGE,
        ...scanArgs,
      ],
    };
  }

  return null;
}

function main() {
  title(staged ? 'secrets — staged changes' : 'secrets — whole repository');

  const runner = resolveRunner();

  if (runner === null) {
    fail('neither gitleaks nor docker is available');
    hint('install gitleaks (https://github.com/gitleaks/gitleaks), or start Docker');
    hint('this check is never skipped: a secret reaching the history cannot be unpublished');
    return 1;
  }

  if (runner.command === 'docker') {
    info(`gitleaks not on PATH — using ${IMAGE}`);
  }

  const result = runAttached(runner.command, runner.args, { cwd: repoRoot });

  line();
  if (result.code === 0) {
    ok('no secret found');
    return 0;
  }

  fail(`gitleaks exited with ${result.code}`, 'remove the secret and rotate it — it is burned');
  return result.code;
}

process.exitCode = main();
