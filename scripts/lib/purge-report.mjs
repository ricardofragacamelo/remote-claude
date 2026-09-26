/**
 * What `pnpm db purge` says, from the one JSON line the backend's command prints.
 *
 * The backend reports; this turns the report into sentences. It says what went and from which
 * trail, up to when — and, when something failed, what did **not** go and why, which is the half a
 * purge that "failed" without detail leaves the reader to reconstruct
 * (docs/plans/03-rules-and-audit/F3-retention.md, B-18).
 *
 * Pure on purpose: the script renders the lines, and the sentences are tested without a database.
 */

/**
 * One line of output: how it is marked, and what it says.
 *
 * @typedef {{ kind: 'ok' | 'fail' | 'warn' | 'hint', text: string }} ReportLine
 */

/**
 * @typedef {object} TrailSummary
 * @property {'entries' | 'events'} trail
 * @property {number} deleted
 * @property {string | null} error
 */

/**
 * @typedef {object} PurgeSummary
 * @property {'completed' | 'failed' | 'skipped' | 'notStarted'} status
 * @property {'job' | 'cli'} [triggeredBy]
 * @property {number} retentionDays
 * @property {string} [cutoff]
 * @property {string | null} [purgeId]
 * @property {string | null} [reason]
 * @property {string} [error]
 * @property {readonly TrailSummary[]} [trails]
 */

/** How each trail is named to a person. */
const TRAIL_NAMES = { entries: 'tool invocations', events: 'account events' };

/**
 * The report's JSON line, out of whatever reached stdout.
 *
 * The last line that **is** a report, not simply the last line: `pnpm --filter … exec` writes its
 * own complaint about a non-zero exit to stdout, after the command's output, and a failed purge is
 * exactly when that happens.
 *
 * @param {string} stdout
 * @returns {PurgeSummary | null} `null` when there is no report to read
 */
export function parsePurgeReport(stdout) {
  const lines = stdout
    .split('\n')
    .map((text) => text.trim())
    .filter((text) => text.startsWith('{'))
    .reverse();

  for (const candidate of lines) {
    const report = asReport(candidate);
    if (report !== null) {
      return report;
    }
  }

  return null;
}

/**
 * @param {string} text
 * @returns {PurgeSummary | null}
 */
function asReport(text) {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && 'status' in parsed ? parsed : null;
  } catch {
    // Not a report — a line that only happens to start with a brace.
    return null;
  }
}

/**
 * @param {PurgeSummary} report
 * @returns {ReportLine[]}
 */
export function describePurge(report) {
  if (report.status === 'notStarted') {
    const window = `older than ${String(report.retentionDays)} days`;

    return [
      { kind: 'fail', text: `the purge could not start: ${report.error ?? 'unknown error'}` },
      { kind: 'hint', text: `nothing was removed — every row ${window} is still there` },
      { kind: 'hint', text: 'is the stack up? `pnpm dev` brings PostgreSQL with it' },
    ];
  }

  const cutoff = report.cutoff ?? 'the cutoff';

  if (report.status === 'skipped') {
    return [
      { kind: 'ok', text: 'another purge is already running — this one removed nothing' },
      { kind: 'hint', text: 'the backend job and this command share one lock; that one covers it' },
    ];
  }

  const trails = report.trails ?? [];
  /** @type {ReportLine[]} */
  const lines = trails.map((trail) =>
    trail.error === null
      ? {
          kind: 'ok',
          text: `${TRAIL_NAMES[trail.trail]}: ${String(trail.deleted)} removed, nothing left before ${cutoff}`,
        }
      : {
          kind: 'fail',
          text: `${TRAIL_NAMES[trail.trail]}: ${String(trail.deleted)} removed, then refused — rows before ${cutoff} remain: ${trail.error}`,
        },
  );

  if (report.status === 'failed') {
    lines.push(
      {
        kind: 'hint',
        text: `every batch that went is recorded in audit_purges (${String(report.purgeId)})`,
      },
      {
        kind: 'hint',
        text: 'run it again: it resumes where it stopped, and removes nothing twice',
      },
    );
  }

  return lines;
}
