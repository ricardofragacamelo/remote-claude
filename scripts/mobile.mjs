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
 *   generate · format · format:check · analyze · arch · test:unit · test:widget · test:native ·
 *   coverage · test:e2e · test:e2e:push
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { EMULATOR_API_LEVEL, apiLevelProblem, suiteProblem } from './lib/android.mjs';
import { COVERAGE_THRESHOLDS } from './lib/coverage.mjs';
import { commandExists, run, runAttached } from './lib/exec.mjs';
import { parseViolations } from './lib/import-lint.mjs';
import { checkCoverage, readReport, reportPathOf } from './lib/lcov.mjs';
import { repoRoot } from './lib/paths.mjs';
import { dartDefines } from './lib/stack.mjs';
import { bold, dim, fail, fatal, hint, info, line, ok, title } from './lib/ui.mjs';

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

/** The Android application id, as `mobile/android/app/build.gradle.kts` declares it. */
const ANDROID_PACKAGE = 'com.remoteclaude.remote_claude';

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

/**
 * Where the Riverpod generator writes, as build filters.
 *
 * A folder that grows an `@riverpod` gains a line here.
 */
const GENERATED_OUTPUTS = ['lib/app/*.g.dart', 'lib/core/**.g.dart', 'lib/features/**.g.dart'];

/**
 * Deletes the outputs of the Riverpod generator before it runs, and answers how many.
 *
 * This is not tidiness; it is the difference between a build that takes one second and one that
 * never ends. The generated files are **committed**, so they are already on disk when the build
 * starts. When one of them is stale, build_runner stops and asks — on standard input — whether it
 * may overwrite it. Nothing is there to answer, so the build sits at a few per cent of one core
 * for as long as anybody is willing to wait: it was measured at fifty minutes before being
 * killed, twice, and read as the machine being busy. The option that used to suppress the
 * question, `--delete-conflicting-outputs`, no longer exists in this version of build_runner.
 * Removing the file first is what is left, and it is enough.
 *
 * Only the outputs of **this** generator go: a file is deleted when the source beside it declares
 * it as its `part`. `protocol.g.dart` is written by `scripts/contracts.mjs` and has no such
 * source, so it stays — deleting it would swap a stall for a compile error.
 *
 * And only under [root]. A build filtered to one folder regenerates that folder and nothing else,
 * so clearing the whole of `lib` before it left every other feature without its providers — the
 * next compile failed in files nobody had touched.
 *
 * @param {string} root the folder whose outputs the build is about to write
 * @returns {number} how many files were removed
 */
function clearGenerated(root) {
  /**
   * @param {string} directory
   * @returns {string[]}
   */
  const walk = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });

  const generated = walk(root).filter((file) => {
    if (!file.endsWith('.g.dart')) {
      return false;
    }

    const source = file.replace(/\.g\.dart$/, '.dart');

    return (
      fs.existsSync(source) &&
      fs.readFileSync(source, 'utf8').includes(`part '${path.basename(file)}';`)
    );
  });

  for (const file of generated) {
    fs.rmSync(file);
  }

  return generated.length;
}

/**
 * Regenerates the Riverpod providers.
 *
 * The generated files are **committed**, like the protocol's, so this is not part of the build:
 * it is run by whoever adds or changes a provider, and `pnpm verify` catches the one who forgot
 * by failing to compile.
 *
 * It takes an optional folder — `node scripts/mobile.mjs generate lib/features/device` — and that
 * is not a convenience. Resolving a feature that pulls in a heavy plugin costs minutes the first
 * time; regenerating the one folder you touched costs seconds, and the rest is already on disk
 * and committed.
 *
 * @returns {number}
 */
function generate() {
  const only = process.argv[3];
  const outputs = only === undefined ? GENERATED_OUTPUTS : [`${only.replace(/\/$/, '')}/**.g.dart`];
  const filters = outputs.map((output) => `--build-filter=${output}`);

  const removed = clearGenerated(path.join(mobileDir, only ?? 'lib'));
  if (removed > 0) {
    info(`${String(removed)} generated file(s) removed before the build`);
  }

  const code = inModule('dart', ['run', 'build_runner', 'build', ...filters]);

  if (code !== 0) {
    hint('a stale lock survives a killed run: rm -rf mobile/.dart_tool/build/lock');
    return code;
  }

  // The generator writes with its own formatter, which does not always agree with the module's.
  // Formatting `lib` here rather than leaving it to the next `format:check` keeps the two in
  // step; it is idempotent, so covering more than what was just written costs nothing.
  return inModule('dart', ['format', 'lib']);
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
 * The scenarios this end proves, by file name, and the version this build reports.
 *
 * Every scenario the app runs is compiled in as **one** JSON object keyed by the file name — the
 * walking skeleton's and every `mobile-*.json` of plans 02 and 03 — because a device has no repository to
 * read them from, and one define per scenario would grow the command line with every scenario.
 *
 * @returns {{ scenario: string, appVersion: string }}
 */
function sharedScenario() {
  const directory = path.join(repoRoot, 'e2e/scenarios');
  const manifest = path.join(mobileDir, 'pubspec.yaml');
  const version = /^version:\s*(\S+)/m.exec(fs.readFileSync(manifest, 'utf8'))?.[1];

  const names = fs
    .readdirSync(directory)
    .map((entry) => entry.replace(/\.json$/, ''))
    .filter((name) => name === 'vertical-ping' || name.startsWith('mobile-'))
    .sort();

  // Compacted: the JSON travels as one `--dart-define`, and a newline inside it would be a second
  // argument on any platform that goes through a shell.
  return {
    scenario: JSON.stringify(
      Object.fromEntries(
        names.map((name) => [
          name,
          JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), 'utf8')),
        ]),
      ),
    ),
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
 * Whether the attached device runs the one image the suite is fixed on — S-67.
 *
 * Checked before anything is built: a Gradle build and an install are minutes, and a run on the
 * wrong image is minutes spent proving something about a different phone.
 *
 * @returns {string | null} what is wrong, or `null` when the device is the fixed image
 */
function deviceImageProblem() {
  const answered = run('adb', ['shell', 'getprop', 'ro.build.version.sdk'], { timeoutMs: 30_000 });

  if (answered.code !== 0) {
    return `adb could not ask the device its API level: ${answered.stderr.trim()}`;
  }

  return apiLevelProblem(answered.stdout);
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
 * Runs a device suite, shows everything it printed, and answers an exit code that means something.
 *
 * Read and not only attached: the exit code of a device run is not enough on its own —
 * see {@link suiteProblem}.
 *
 * @param {'flutter' | 'patrol'} runner
 * @param {string} command
 * @param {readonly string[]} args
 * @returns {number}
 */
function reported(runner, command, args) {
  const result = run(command, args, { cwd: mobileDir, timeoutMs: 1_800_000 });
  line(result.stdout.trimEnd());
  if (result.stderr.trim() !== '') {
    line(result.stderr.trimEnd());
  }

  if (result.code !== 0) {
    return result.code;
  }

  const problem = suiteProblem(runner, `${result.stdout}\n${result.stderr}`);
  if (problem !== null) {
    fail(problem);
    return 1;
  }

  return 0;
}

/**
 * Prepares the device and answers the defines, or `null` when it cannot run — the half both
 * device suites share.
 *
 * @returns {string[] | null}
 */
function preparedDevice() {
  const dotEnv = path.join(repoRoot, 'e2e/.env');

  if (!fs.existsSync(dotEnv)) {
    fatal('there is no stack to talk to: e2e/.env does not exist');
    hint('run `pnpm test:e2e`, which brings the ephemeral stack up and runs both ends against it');
    return null;
  }

  process.loadEnvFile(dotEnv);
  const { scenario, appVersion } = sharedScenario();

  const ports = [...new Set(stackPorts(process.env))];
  const problem = forwardToDevice(ports);

  if (problem !== null) {
    fail(problem);
    hint('the app runs on the device; without the forward it reaches nothing on this machine');
    return null;
  }
  ok('forwarded to the device', ports.map((port) => `tcp:${String(port)}`).join(' '));

  const image = deviceImageProblem();
  if (image !== null) {
    fail(image);
    hint(
      `start the API ${String(EMULATOR_API_LEVEL)} image: emulator -avd remote_claude_api35 (README, Comandos)`,
    );
    return null;
  }
  ok(`the device runs the fixed image`, `API ${String(EMULATOR_API_LEVEL)}`);

  return dartDefines(/** @type {Record<string, string>} */ (process.env), scenario, appVersion);
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
  const defines = preparedDevice();
  return defines === null
    ? 1
    : reported('flutter', 'flutter', ['test', 'integration_test', ...defines]);
}

/**
 * The run that really notifies — plan 02, D-26, S-54 and S-67.
 *
 * Through `patrol`, because it is the one thing that reaches the operating system's own screens:
 * the notification permission dialog, the home button, and the notification in the tray. It needs
 * the same device and the same stack as {@link endToEnd}; `scripts/run-e2e-local.mjs --push` is what
 * brings the stack up with the push settings of the `.env`.
 *
 * @returns {number}
 */
function endToEndWithPush() {
  const patrol = path.join(os.homedir(), '.pub-cache', 'bin', 'patrol');

  if (!commandExists(patrol, ['--version'])) {
    fatal('patrol is not installed');
    hint('dart pub global activate patrol_cli 4.8.0');
    return 1;
  }

  const defines = preparedDevice();
  if (defines === null) {
    return 1;
  }

  // The dialog of S-67 is the one a first install shows. Clearing the app's data between runs
  // does not take the notification permission back, so a second run would find it granted and
  // prove nothing — it is revoked here, with the flags that remember a person's answer. On a
  // device where the app was never installed there is nothing to revoke, and that is fine.
  for (const args of [
    ['shell', 'pm', 'revoke', ANDROID_PACKAGE, 'android.permission.POST_NOTIFICATIONS'],
    [
      'shell',
      'pm',
      'clear-permission-flags',
      ANDROID_PACKAGE,
      'android.permission.POST_NOTIFICATIONS',
      'user-set',
      'user-fixed',
    ],
  ]) {
    run('adb', args, { timeoutMs: 30_000 });
  }

  const code = reported('patrol', patrol, [
    'test',
    '--target',
    'patrol_test/push_delivery_test.dart',
    ...defines,
  ]);

  // `patrol` writes its entry point next to the tests on every run. It is a build artefact, and
  // one left behind is a file the formatting gate then finds (plan 02, progress, cycle 36).
  fs.rmSync(path.join(mobileDir, 'patrol_test', 'test_bundle.dart'), { force: true });

  return code;
}

/**
 * The JVM tests of the Android side — the push transport that D-21 keeps out of Dart.
 *
 * Only the logic without Android in it is tested here (which keys cross the channel, which
 * permission word each state becomes, how much of a token a log line shows): the rest is the
 * operating system and the supplier's library, which only a device exercises.
 *
 * The Gradle wrapper is not committed — Flutter writes it — so a fresh checkout has none, and
 * `--config-only` is how Flutter writes it without building anything.
 *
 * @returns {number}
 */
function nativeTests() {
  const androidDir = path.join(mobileDir, 'android');
  const wrapper = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

  if (!fs.existsSync(wrapper)) {
    info('no Gradle wrapper yet — asking Flutter to write one');
    const code = inModule('flutter', ['build', 'apk', '--config-only']);
    if (code !== 0) {
      return code;
    }
  }

  return runAttached(wrapper, [':app:testDebugUnitTest', '--console=plain'], {
    cwd: androidDir,
    timeoutMs: 900_000,
  }).code;
}

/** What each task does. Every one of them answers an exit code that means something. */
const TASKS = {
  generate,
  format: () => inModule('dart', ['format', '.']),
  'format:check': () => inModule('dart', ['format', '--output=none', '--set-exit-if-changed', '.']),
  analyze: () => inModule('flutter', ['analyze']),
  arch: architecture,
  'test:unit': () => inModule('flutter', ['test', 'test/unit']),
  'test:widget': () => inModule('flutter', ['test', 'test/widget']),
  'test:native': nativeTests,
  'test:e2e': endToEnd,
  'test:e2e:push': endToEndWithPush,
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
