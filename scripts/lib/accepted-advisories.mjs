/**
 * The advisories gate 10 accepts for a while, by an ADR, and nothing else (ADR-019).
 *
 * The rule of the gate is "update the dependency; never ignore the advisory id". It has one hole: an
 * advisory with **no fixed version** cannot be updated past. An exception for one is a decision,
 * not a config edit, so each entry names the ADR that took it — and it is held to the narrowest
 * reading there is:
 *
 * - the advisory id **and** the package **and** the version, all three;
 * - reached **only** through the paths the entry names — the same package arriving by any other
 *   dependency is a new risk, and fails;
 * - until a date, after which the gate fails again with the reason, whether or not a fix shipped.
 *
 * The file lives in the repository, so the exception is reviewed like code and is visible to
 * anybody who runs the gate.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Where the exceptions are kept, relative to the repository. */
export const ACCEPTED_ADVISORIES_FILE = 'scripts/accepted-advisories.json';

/** The severities `pnpm audit` is asked to stop at — the same as `--audit-level high`. */
const STOPPING = new Set(['high', 'critical']);

/**
 * @typedef {object} AcceptedAdvisory
 * @property {string} id the advisory id, e.g. `GHSA-vfj7-8cjw-p6xm`
 * @property {string} package the package it is in
 * @property {string} version the one version accepted
 * @property {string[]} via path prefixes of `pnpm audit` it may be reached by, e.g. `.>jscpd>`
 * @property {string} adr the decision that took the exception
 * @property {string} expires the last day it holds, `YYYY-MM-DD`
 */

/**
 * @typedef {object} AuditFinding
 * @property {string} id
 * @property {string} package
 * @property {string} version
 * @property {string[]} paths
 */

/**
 * @typedef {object} Judged
 * @property {AuditFinding[]} failing what the gate fails on, with the reason
 * @property {string[]} reasons one line per failing finding
 * @property {string[]} accepted one line per finding an exception covers, with until when
 */

const ID = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ADR = /^ADR-\d{3}$/;

/**
 * Reads the exceptions, refusing anything that does not read as one: an exception that is half
 * there would be wider than the ADR that took it.
 *
 * @param {string} text the file
 * @returns {AcceptedAdvisory[]}
 * @throws {Error} when an entry is not a whole exception
 */
export function readAccepted(text) {
  const value = JSON.parse(text);

  if (!Array.isArray(value)) {
    throw new Error(`${ACCEPTED_ADVISORIES_FILE} is not a list`);
  }

  return value.map((entry, at) => {
    if (!isWhole(entry)) {
      throw new Error(
        `${ACCEPTED_ADVISORIES_FILE} entry ${String(at)} is not a whole exception: ` +
          'id, package, version, via, adr, expires',
      );
    }
    return entry;
  });
}

/** @param {unknown} value */
const text = (value) => typeof value === 'string' && value !== '';

/** @param {unknown} value */
const prefixes = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((prefix) => typeof prefix === 'string' && prefix.startsWith('.>'));

/** What each field of an exception has to be — every one of them, or it is not one. */
const FIELDS = /** @type {const} */ ([
  ['id', (/** @type {unknown} */ value) => ID.test(String(value))],
  ['package', text],
  ['version', text],
  ['via', prefixes],
  ['adr', (/** @type {unknown} */ value) => ADR.test(String(value))],
  ['expires', (/** @type {unknown} */ value) => DAY.test(String(value))],
]);

/**
 * @param {unknown} entry
 * @returns {entry is AcceptedAdvisory}
 */
function isWhole(entry) {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const record = /** @type {Record<string, unknown>} */ (entry);
  return FIELDS.every(([field, holds]) => holds(record[field]));
}

/**
 * The exceptions of the repository — none when there is no file.
 *
 * @param {string} root the repository
 * @returns {AcceptedAdvisory[]}
 */
export function loadAccepted(root) {
  const file = path.join(root, ACCEPTED_ADVISORIES_FILE);
  return fs.existsSync(file) ? readAccepted(fs.readFileSync(file, 'utf8')) : [];
}

/**
 * The findings of `pnpm audit --json` the gate stops at — high and critical — one per advisory and
 * version, with the paths it is reached by.
 *
 * @param {string} stdout what `pnpm audit --json` printed
 * @returns {AuditFinding[]}
 * @throws {Error} when the answer is not an audit — a scan that could not be read found nothing
 */
export function auditFindings(stdout) {
  const report = JSON.parse(stdout);

  if (typeof report !== 'object' || report === null || typeof report.advisories !== 'object') {
    throw new Error('pnpm audit did not answer with its report');
  }

  return Object.values(report.advisories)
    .filter((advisory) => STOPPING.has(advisory.severity))
    .flatMap((advisory) =>
      (advisory.findings ?? []).map(
        (/** @type {{ version: unknown, paths?: unknown[] }} */ finding) => ({
          id: String(advisory.github_advisory_id),
          package: String(advisory.module_name),
          version: String(finding.version),
          paths: (finding.paths ?? []).map(String),
        }),
      ),
    );
}

/**
 * The exception that covers a finding today, and why none does when none does.
 *
 * @param {AuditFinding} finding `paths` empty for a scanner that does not say them (osv)
 * @param {readonly AcceptedAdvisory[]} accepted
 * @param {string} today `YYYY-MM-DD`
 * @returns {{ entry: AcceptedAdvisory } | { reason: string }}
 */
export function coverOf(finding, accepted, today) {
  const entry = accepted.find(
    (each) =>
      each.id === finding.id &&
      each.package === finding.package &&
      each.version === finding.version,
  );

  if (entry === undefined) {
    return { reason: 'no exception — update the dependency; never ignore the advisory id' };
  }
  if (today > entry.expires) {
    return { reason: `the exception of ${entry.adr} ended on ${entry.expires}` };
  }

  const elsewhere = finding.paths.filter(
    (reached) => !entry.via.some((prefix) => reached.startsWith(prefix)),
  );
  if (elsewhere.length > 0) {
    return { reason: `reached outside what ${entry.adr} accepts: ${elsewhere.join(', ')}` };
  }

  return { entry };
}

/**
 * What the gate does with the findings: fails on each one no exception covers, and says aloud each
 * one it lets through — an accepted advisory is never silent.
 *
 * @param {readonly AuditFinding[]} findings
 * @param {readonly AcceptedAdvisory[]} accepted
 * @param {string} today `YYYY-MM-DD`
 * @returns {Judged}
 */
export function judge(findings, accepted, today) {
  /** @type {Judged} */
  const judged = { failing: [], reasons: [], accepted: [] };

  for (const finding of findings) {
    const cover = coverOf(finding, accepted, today);
    const name = `${finding.package}@${finding.version} ${finding.id}`;

    if ('entry' in cover) {
      judged.accepted.push(`${name} — accepted by ${cover.entry.adr} until ${cover.entry.expires}`);
    } else {
      judged.failing.push(finding);
      judged.reasons.push(`${name} — ${cover.reason}`);
    }
  }

  return judged;
}

/**
 * Today as the exceptions write it, in UTC.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function todayOf(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
