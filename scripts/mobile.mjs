#!/usr/bin/env node
/**
 * The Flutter module's gates, behind one command.
 *
 * The Dart toolchain does not line up with the Node one: `dart format` is the formatter, the
 * analyzer is both linter and type checker, `import_lint` reports violations and then exits 0
 * anyway, and `flutter test --coverage` writes a report nothing reads. Each of those needs a
 * thin wrapper with an **honest exit code**, and having them in one place is what keeps them
 * from being seven scripts that drift.
 *
 * Usage: `node scripts/mobile.mjs <task>`
 *   format · format:check · analyze · arch · test:unit · test:widget · coverage · test:e2e
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { COVERAGE_THRESHOLDS } from './lib/coverage.mjs';
import { commandExists, run, runAttached } from './lib/exec.mjs';
import { parseViolations } from './lib/import-lint.mjs';
import { checkCoverage, readReport, reportPathOf } from './lib/lcov.mjs';
import { repoRoot } from './lib/paths.mjs';
import { dartDefines } from './lib/stack.mjs';
import { bold, dim, fail, fatal, hint, line, ok, title } from './lib/ui.mjs';

/**
 * Files the coverage bar does not apply to, each for a stated reason.
 *
 * Generated code is written by nobody, and `main.dart` is four calls into things that are
 * themselves covered — the same exception `main.ts` carries on the backend.
 */
export const COVERAGE_EXCLUSIONS = [
  '**/*.g.dart',
  '**/*.freezed.dart',
  'lib/l10n/generated/**',
  'lib/main.dart',

  // Fixtures the architecture test writes into `lib/` for the length of one test — `import_lint`
  // only analyses `lib/`, so a deliberate violation has to live there. They hold one import and
  // nothing else, and they are deleted in the same test; measuring them would make the number
  // depend on which suite happened to be running.
  'lib/**/_arch_*.dart',
];

const mobileDir = path.join(repoRoot, 'mobile');

/**
 * Runs a Dart or Flutter command inside the module.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @returns {number}
 */
function inModule(command, args) {
  return runAttached(command, args, { cwd: mobileDir, timeoutMs: 900_000 }).code;
}

/** @returns {number} */
function architecture() {
  const result = run('dart', ['run', 'import_lint'], { cwd: mobileDir, timeoutMs: 900_000 });
  const violations = parseViolations(`${result.stdout}\n${result.stderr}`);

  for (const violation of violations) {
    fail(violation.rule, `${violation.location} imports ${violation.offender}`);
  }

  if (violations.length > 0) {
    hint('docs/architecture/shared/09-code-quality.md#regras-de-arquitetura-como-lint');
    return 1;
  }

  // A tool that could not run is not a tool that found nothing.
  if (result.code !== 0) {
    fatal(`import_lint exited with ${String(result.code)}`);
    line(result.stderr.trim());
    return result.code;
  }

  ok('every import rule holds');
  return 0;
}

/** @returns {number} */
function coverage() {
  const testCode = inModule('flutter', ['test', '--coverage']);
  if (testCode !== 0) {
    return testCode;
  }

  const report = readReport(reportPathOf(mobileDir));

  if (report === null) {
    fail('no lcov.info', 'flutter test --coverage wrote no report');
    return 1;
  }

  // Dart's lcov carries `DA` records only — hits per line. There is no `BRDA` and no `FN`, so
  // branches and functions cannot be measured on this end; the gap is recorded in the plan
  // rather than papered over.
  const verdict = checkCoverage(report, {
    minimum: COVERAGE_THRESHOLDS.lines,
    exclude: COVERAGE_EXCLUSIONS,
  });

  for (const entry of verdict.below) {
    fail(entry.file, `${entry.percent.toFixed(1)} % of lines (${entry.covered}/${entry.total})`);
  }

  if (verdict.below.length > 0) {
    fail(
      bold(`${String(verdict.below.length)} file(s) below ${String(COVERAGE_THRESHOLDS.lines)} %`),
      'per file — there is no average that makes up for a gap',
    );
    hint('write the missing test; never lower the bar or exclude the file');
    return 1;
  }

  ok(
    bold(`${String(verdict.measured.length)} files at or above the bar`),
    dim(`${verdict.overall.toFixed(1)} % of lines`),
  );
  return 0;
}

/**
 * The scenario both ends prove, and the version this build reports.
 *
 * @returns {{ scenario: string, appVersion: string }}
 */
function sharedScenario() {
  const file = path.join(repoRoot, 'e2e/scenarios/vertical-ping.json');
  const manifest = path.join(mobileDir, 'pubspec.yaml');
  const version = /^version:\s*(\S+)/m.exec(fs.readFileSync(manifest, 'utf8'))?.[1];

  // Compacted: the JSON travels as one `--dart-define`, and a newline inside it would be a second
  // argument on any platform that goes through a shell.
  return {
    scenario: JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))),
    appVersion: version ?? '0.0.0',
  };
}

/**
 * Makes the host's ports answer on `localhost` **inside** an Android device.
 *
 * An emulator is a separate machine: `localhost` there is the emulator, not the computer running
 * the stack. `adb reverse` is what closes that gap, and it is worth more than rewriting the URLs
 * to `10.0.2.2` would be — the issuer in the token has to match the one the backend was
 * configured with, and rewriting the host changes it.
 *
 * @param {readonly number[]} ports
 * @returns {string | null} what went wrong, or `null` when every port is forwarded
 */
function forwardToDevice(ports) {
  if (!commandExists('adb', ['version'])) {
    return 'adb is not on PATH — the device cannot reach the stack on this machine';
  }

  for (const port of ports) {
    const forwarded = run('adb', ['reverse', `tcp:${String(port)}`, `tcp:${String(port)}`], {
      timeoutMs: 30_000,
    });

    if (forwarded.code !== 0) {
      return `adb reverse tcp:${String(port)} failed: ${forwarded.stderr.trim()}`;
    }
  }

  return null;
}

/**
 * The TCP ports of the running stack, read out of the URLs the runner wrote.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {number[]}
 */
function stackPorts(env) {
  return ['RC_BACKEND_URL', 'RC_OIDC_ISSUER', 'RC_KEYCLOAK_URL']
    .map((name) => Number(new URL(env[name] ?? 'http://localhost').port))
    .filter((port) => Number.isInteger(port) && port > 0);
}

/**
 * The Flutter end of the end-to-end suite — S-62.
 *
 * It talks to a stack that is already up, whose addresses `scripts/run-e2e-local.mjs` wrote into
 * `e2e/.env`. There is no stack of its own: a second implementation of "bring PostgreSQL and
 * Keycloak up" is exactly the pair that drifts, and this end has to test the *same* backend the
 * web suite did or the two prove different things.
 *
 * A **device** is required — emulator, simulator or a real handset. Flutter refuses to run
 * anything under `integration_test/` without one, and that refusal is left in place: answering 0
 * when no device is attached would make this pass by being absent.
 *
 * It is not part of `pnpm verify:full`. An emulator and a Gradle build are minutes and gigabytes,
 * and a check that expensive on every validation cycle is one that ends up switched off. It is
 * run on purpose — see docs/plans/00-bootstrap/F6-scripts-e2e.md#o-e2e-do-mobile-não-é-portão.
 *
 * @returns {number}
 */
function endToEnd() {
  const dotEnv = path.join(repoRoot, 'e2e/.env');

  if (!fs.existsSync(dotEnv)) {
    fatal('there is no stack to talk to: e2e/.env does not exist');
    hint('run `pnpm test:e2e`, which brings the ephemeral stack up and runs both ends against it');
    return 1;
  }

  process.loadEnvFile(dotEnv);
  const { scenario, appVersion } = sharedScenario();

  const ports = [...new Set(stackPorts(process.env))];
  const problem = forwardToDevice(ports);

  if (problem !== null) {
    fail(problem);
    hint('the app runs on the device; without the forward it reaches nothing on this machine');
    return 1;
  }
  ok('forwarded to the device', ports.map((port) => `tcp:${String(port)}`).join(' '));

  return inModule('flutter', [
    'test',
    'integration_test',
    ...dartDefines(/** @type {Record<string, string>} */ (process.env), scenario, appVersion),
  ]);
}

/** What each task does. Every one of them answers an exit code that means something. */
const TASKS = {
  format: () => inModule('dart', ['format', '.']),
  'format:check': () => inModule('dart', ['format', '--output=none', '--set-exit-if-changed', '.']),
  analyze: () => inModule('flutter', ['analyze']),
  arch: architecture,
  'test:unit': () => inModule('flutter', ['test', 'test/unit']),
  'test:widget': () => inModule('flutter', ['test', 'test/widget']),
  'test:e2e': endToEnd,
  coverage,
};

const task = process.argv[2] ?? '';
const runTask = /** @type {Record<string, () => number>} */ (TASKS)[task];

if (runTask === undefined) {
  fatal(`usage: node scripts/mobile.mjs <${Object.keys(TASKS).join(' | ')}>`);
  process.exit(2);
}

title(`mobile — ${task}`);

if (!commandExists('flutter')) {
  fatal('flutter is not on PATH — the mobile module cannot be checked');
  hint('install Flutter (https://docs.flutter.dev/get-started/install), then run this again');
  hint('this gate is never skipped: a rule nobody runs is a rule that is already broken');
  process.exit(1);
}

process.exitCode = runTask();
