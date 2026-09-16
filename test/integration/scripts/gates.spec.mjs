import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { run, runAsync } from '../../../scripts/lib/exec.mjs';

// These spawn real tools over the real repository; the default 5 s is a unit-test budget.
vi.setConfig({ testTimeout: 300_000 });

/**
 * The gates as the terminal sees them.
 *
 * A gate is a promise about an **exit code**: 0 only when it passed. That is a contract of the
 * process, not of a function, so it is checked by running the process — and by making it fail on
 * purpose, because a gate nobody has watched fail is a gate nobody knows is connected.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Runs one of the repository's scripts to completion.
 *
 * Asynchronously, and that is not a detail: some of these take the better part of a minute, and
 * the blocking form holds the worker's thread for all of it — long enough that vitest's reporter
 * gives up on the worker and the run fails naming an RPC timeout instead of a gate.
 *
 * @param {string} script file name inside `scripts/`
 * @param {readonly string[]} args
 * @returns {Promise<import('../../../scripts/lib/exec.mjs').RunResult>}
 */
function runScript(script, args = []) {
  return runAsync(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
    cwd: repoRoot,
    timeoutMs: 280_000,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

/** Files written into the repository for the length of one test. */
/** @type {string[]} */
const written = [];

/**
 * @param {string} relative
 * @param {string} contents
 */
function writeTemporary(relative, contents) {
  const full = path.join(repoRoot, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  written.push(full);
  return full;
}

/** @type {{ file: string, contents: string }[]} */
const saved = [];

/** @param {string} relative */
function editTemporarily(relative) {
  const full = path.join(repoRoot, relative);
  saved.push({ file: full, contents: fs.readFileSync(full, 'utf8') });
  return full;
}

afterEach(() => {
  for (const full of written.splice(0)) {
    fs.rmSync(full, { force: true });
  }

  for (const entry of saved.splice(0)) {
    fs.writeFileSync(entry.file, entry.contents);
  }
});

describe('i18n-check.mjs', () => {
  it('passes over the catalogues as they stand', async () => {
    const result = await runScript('i18n-check.mjs');

    expect(result.stdout).toContain('every catalogue agrees');
    expect(result.code).toBe(0);
  });

  // S-05 — a key in `en` and not in `pt-BR`.
  it('fails when a key never reached the other language', async () => {
    const file = editTemporarily('web/src/shared/i18n/locales/en.json');
    const catalogue = JSON.parse(fs.readFileSync(file, 'utf8'));
    catalogue.session.ping.brandNew = 'Only here';
    fs.writeFileSync(file, JSON.stringify(catalogue, null, 2));

    const result = await runScript('i18n-check.mjs');

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('session.ping.brandNew');
    expect(result.stdout).toContain('absent from pt-BR');
  });

  // S-08 — the placeholder survives in one language only.
  it('fails when a placeholder does not survive the translation', async () => {
    const file = editTemporarily('mobile/lib/l10n/app_pt.arb');
    const catalogue = JSON.parse(fs.readFileSync(file, 'utf8'));
    catalogue.sessionPingSessionLabel = 'Sessão';
    fs.writeFileSync(file, JSON.stringify(catalogue, null, 2));

    const result = await runScript('i18n-check.mjs');

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('sessionPingSessionLabel');
    expect(result.stdout).toContain('sessionId');
  });

  // S-06 — a key nobody uses.
  it('fails on a key that is declared and never used', async () => {
    for (const locale of ['en', 'pt-BR']) {
      const file = editTemporarily(`web/src/shared/i18n/locales/${locale}.json`);
      const catalogue = JSON.parse(fs.readFileSync(file, 'utf8'));
      catalogue.session.ping.forgotten = 'Nobody asks for this';
      fs.writeFileSync(file, JSON.stringify(catalogue, null, 2));
    }

    const result = await runScript('i18n-check.mjs');

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('declared, never used');
  });
});

describe('lint:dup — the duplication gate', () => {
  /** @param {readonly string[]} args */
  function jscpd(args) {
    return run('pnpm', ['exec', 'jscpd', ...args], {
      cwd: repoRoot,
      timeoutMs: 280_000,
      env: { ...process.env, NO_COLOR: '1' },
    });
  }

  const block = [
    'export function shapedTheSameWay(input) {',
    '  const first = input.alpha;',
    '  const second = input.beta;',
    '  const third = input.gamma;',
    '  const fourth = input.delta;',
    '  return [first, second, third, fourth];',
    '}',
  ].join('\n');

  // S-65 — a duplicated block above the threshold fails.
  it('fails on a block copied from one file to another', () => {
    writeTemporary('.tmp-duplication-probe/one.js', block);
    writeTemporary('.tmp-duplication-probe/two.js', block);

    const result = jscpd(['.tmp-duplication-probe']);

    expect(result.code).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('over threshold');
  });

  // S-66 — generated code is not duplication.
  it('does not count generated code', () => {
    writeTemporary('.tmp-duplication-probe/one.g.dart', block);
    writeTemporary('.tmp-duplication-probe/two.g.dart', block);

    expect(jscpd(['.tmp-duplication-probe']).code).toBe(0);
  });

  it('passes over the repository as it stands', () => {
    expect(jscpd([]).code).toBe(0);
  });
});

describe('mobile.mjs', () => {
  it('refuses a task nobody defined, rather than doing nothing quietly', async () => {
    const result = await runScript('mobile.mjs', ['polish-the-icons']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('usage');
  });

  // The architecture gate has to bite: `import_lint` itself always exits 0.
  it('fails when a feature’s domain reaches for the outside world', async () => {
    writeTemporary(
      'mobile/lib/features/session/domain/entities/_arch_gate_probe.dart',
      "import 'package:dio/dio.dart';\n",
    );

    const result = await runScript('mobile.mjs', ['arch']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('domain_is_pure_http');
  });

  it('passes over the module as it stands', async () => {
    const result = await runScript('mobile.mjs', ['arch']);

    expect(result.stdout).toContain('every import rule holds');
    expect(result.code).toBe(0);
  });
});

describe('scan:secrets — the secret gate', () => {
  // S-67. The value below is a throwaway AWS-shaped key written to make the detector fire; it
  // exists for the length of one test and grants nothing anywhere.
  it('fails on a credential about to be committed', async () => {
    const probe = '.tmp-secret-probe.env';
    writeTemporary(
      probe,
      [
        `AWS_ACCESS_KEY_ID=${'AKIA' + 'IOSFODNN7EXAMPLE'}`,
        `AWS_SECRET_ACCESS_KEY=${'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'}`,
      ].join('\n'),
    );

    // `--staged` is what the pre-commit hook runs, and the index is where a secret still can be
    // stopped: once it is in the history it cannot be unpublished, only rotated.
    run('git', ['add', '--intent-to-add', '--force', probe], { cwd: repoRoot });
    run('git', ['add', '--force', probe], { cwd: repoRoot });

    try {
      const result = await runScript('secrets-scan.mjs', ['--staged']);

      expect(result.code).not.toBe(0);
      expect(result.stdout).toContain('remove the secret and rotate it');
    } finally {
      run('git', ['rm', '--cached', '--force', '--quiet', probe], { cwd: repoRoot });
    }
  });

  it('passes over the history as it stands', async () => {
    const result = await runScript('secrets-scan.mjs');

    expect(result.stdout).toContain('no secret found');
    expect(result.code).toBe(0);
  });
});

describe('scan-security.mjs', () => {
  // The product rules exist before the code they protect, so this is the only way to see one
  // fire: a rule that arrives after the Agent SDK would be born already violated.
  it('refuses a query() that would turn canUseTool off in silence', async () => {
    writeTemporary(
      'backend/src/_gate_probe.ts',
      'export const answer = query({ prompt: "hello" });\n',
    );

    const result = await runScript('scan-security.mjs');

    expect(result.stdout).toContain('query-needs-project-setting-sources');
    expect(result.stdout).toContain('query-needs-pretooluse-hook');
    expect(result.code).toBe(1);
  });
});
