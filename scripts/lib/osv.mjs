/**
 * The dependency scan of gate 10 by `osv-scanner`, and reading what it answers (plan 05, B-16).
 *
 * `pnpm audit` already runs, and stays: it is the npm registry's own view. `osv-scanner` is
 * there for two things it does not do — the Dart lockfile of the app, which no npm tool reads, and
 * advisories below `high`, which the audit is told to let through. **Any** advisory fails here: a
 * known vulnerability in a backend that executes commands on the user's machine is not something to
 * rank before deciding it matters.
 *
 * Reading the answer lives here, apart from the script that runs the scanner, for the reason
 * `dart-metrics.mjs` does: the output is the evidence, and the exit code alone is not. `0` from a
 * scan that never opened a lockfile looks exactly like a clean scan — so a lockfile the scanner
 * did not say it read is an unverified scan, and an unverified scan **fails** (S-35).
 */

import path from 'node:path';

/** Pinned so the check is the same one everywhere, today and in six months. */
export const OSV_IMAGE = 'ghcr.io/google/osv-scanner:v2.6.0';

/** Every lockfile of the product, relative to the repository (S-74). */
export const LOCKFILES = ['pnpm-lock.yaml', 'mobile/pubspec.lock'];

/**
 * What the scanner exits with.
 *
 * `0` nothing found, `1` something found; `127` and `128` are its own failures — an error, or no
 * package to scan at all — and every other code is a scanner that did not finish.
 */
const FOUND = 1;
const CLEAN = 0;

/** The line the scanner prints to stderr for each lockfile it actually read. */
const SCANNED = /^Scanned (\S+) file and found (\d+) packages?$/;

/**
 * @typedef {object} OsvFinding
 * @property {string} lockfile the lockfile it was found through, relative to the repository
 * @property {string} name
 * @property {string} version
 * @property {string[]} advisories the advisory ids, e.g. `GHSA-82fw-gwwq-j7x9`
 */

/**
 * @typedef {object} OsvVerdict
 * @property {'clean' | 'vulnerable' | 'unverified'} status
 * @property {OsvFinding[]} findings
 * @property {string} [reason] why the scan does not count, when it is `unverified`
 */

/**
 * @typedef {object} OsvInvocation
 * @property {string} command
 * @property {string[]} args
 * @property {(reported: string) => string} toRepository maps a path the scanner printed back to
 *   one relative to the repository
 */

/**
 * How to run the scanner: the local binary when there is one, the pinned image otherwise.
 *
 * Docker is already a hard requirement of this project, so there is a fallback rather than a skip
 * — a check that skips itself when a tool is missing is a check that is never run.
 *
 * @param {object} options
 * @param {boolean} options.hasBinary whether `osv-scanner` is on PATH
 * @param {string} options.root the directory the lockfiles are relative to
 * @param {readonly string[]} [options.lockfiles] `path` or `parser:path`, relative to `root`
 * @returns {OsvInvocation}
 */
export function osvInvocation({ hasBinary, root, lockfiles = LOCKFILES }) {
  const base = hasBinary ? root : '/src';
  const scan = [
    'scan',
    'source',
    '--format',
    'json',
    ...lockfiles.flatMap((entry) => ['--lockfile', typedPath(entry, base)]),
  ];

  /** @param {string} reported */
  const toRepository = (reported) => path.posix.relative(base.split(path.sep).join('/'), reported);

  if (hasBinary) {
    return { command: 'osv-scanner', args: scan, toRepository };
  }

  return {
    command: 'docker',
    args: ['run', '--rm', '--volume', `${root}:/src:ro`, OSV_IMAGE, ...scan],
    toRepository,
  };
}

/**
 * `parser:path` keeps its parser, and only the path moves under `base`.
 *
 * @param {string} entry
 * @param {string} base
 */
function typedPath(entry, base) {
  const separator = entry.indexOf(':');
  const [parser, file] =
    separator === -1 ? ['', entry] : [entry.slice(0, separator + 1), entry.slice(separator + 1)];

  return `${parser}${path.posix.join(base.split(path.sep).join('/'), file)}`;
}

/**
 * The lockfiles the scanner says it read, and how many packages in each.
 *
 * @param {string} stderr
 * @param {(reported: string) => string} toRepository
 * @returns {Map<string, number>}
 */
export function scannedLockfiles(stderr, toRepository) {
  /** @type {Map<string, number>} */
  const scanned = new Map();

  for (const line of stderr.split('\n')) {
    const match = SCANNED.exec(line.trim());
    if (match !== null) {
      scanned.set(toRepository(match[1] ?? ''), Number(match[2]));
    }
  }

  return scanned;
}

/**
 * @typedef {object} OsvReportEntry
 * @property {{ name?: string, version?: string }} [package]
 * @property {{ id?: string }[]} [vulnerabilities]
 */

/**
 * @typedef {object} OsvReportResult
 * @property {{ path?: string }} [source]
 * @property {OsvReportEntry[]} [packages]
 */

/**
 * Every vulnerable package in the scanner's JSON.
 *
 * @param {unknown} report the parsed stdout
 * @param {(reported: string) => string} toRepository
 * @returns {OsvFinding[] | null} `null` when the document is not a report at all
 */
export function findingsOf(report, toRepository) {
  const results = /** @type {{ results?: unknown }} */ (report ?? {}).results;
  if (!Array.isArray(results)) {
    return null;
  }

  return /** @type {OsvReportResult[]} */ (results).flatMap((result) =>
    (result.packages ?? []).map((entry) => ({
      lockfile: toRepository(String(result.source?.path ?? '')),
      name: String(entry.package?.name ?? ''),
      version: String(entry.package?.version ?? ''),
      advisories: (entry.vulnerabilities ?? []).map((advisory) => String(advisory.id)),
    })),
  );
}

/**
 * The verdict over one run.
 *
 * Only two outcomes pass nothing wrong: a finding is `vulnerable`, and everything that is not
 * provably a complete scan — an exit code the scanner does not use for an answer, output that is
 * not its report, a lockfile it never said it read, or one it read and found empty — is
 * `unverified`, which fails exactly as a finding does.
 *
 * @param {{ code: number, stdout: string, stderr: string }} run
 * @param {object} expectation
 * @param {readonly string[]} expectation.lockfiles relative to the repository, parser prefix dropped
 * @param {(reported: string) => string} expectation.toRepository
 * @returns {OsvVerdict}
 */
export function interpretOsv(run, { lockfiles, toRepository }) {
  if (run.code !== CLEAN && run.code !== FOUND) {
    return unverified(`the scanner exited with ${String(run.code)}`);
  }

  const findings = findingsOf(parsed(run.stdout), toRepository);
  if (findings === null) {
    return unverified('the scanner printed something that is not its report');
  }

  const scanned = scannedLockfiles(run.stderr, toRepository);
  const missed = lockfiles.filter((lockfile) => (scanned.get(lockfile) ?? 0) === 0);
  if (missed.length > 0) {
    return unverified(`the scanner did not read ${missed.join(', ')}`);
  }

  // It said it found something and listed nothing: whatever it found, we cannot see it.
  if (run.code === FOUND && findings.length === 0) {
    return unverified('the scanner reported a finding its report does not list');
  }

  return findings.length > 0 ? { status: 'vulnerable', findings } : { status: 'clean', findings };
}

/**
 * @param {string} text
 * @returns {unknown} `null` when it is not JSON
 */
function parsed(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** @param {string} reason @returns {OsvVerdict} */
function unverified(reason) {
  return { status: 'unverified', findings: [], reason };
}

/**
 * The repository path of a `parser:path` entry.
 *
 * @param {string} entry
 */
export function lockfilePath(entry) {
  const separator = entry.indexOf(':');
  return separator === -1 ? entry : entry.slice(separator + 1);
}
