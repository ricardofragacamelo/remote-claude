/**
 * What a run of `smoke-live` does with its outcome (plan 05, B-19).
 *
 * The suite runs against the real Claude, and it is the one mechanism that notices the SDK
 * changing its contract. It runs **on demand**, never on a schedule
 * ([D-12 of plan 01](../../docs/plans/01-live-session/decisions.md), kept by D-11 of plan 05):
 * there is no Claude credential in CI. What a failure must not do is end as a red line in one
 * terminal — so it **opens an issue**, and the next failure comments on that same issue rather
 * than opening a second one, because thirty issues saying the same thing is how an issue tracker
 * learns to be ignored.
 *
 * A green run does nothing at all (S-38). Not even closing "its" issue: whether a problem is
 * solved is for whoever works on it to say, and a report that closes issues is one bug away from
 * closing somebody else's.
 *
 * Every function here is pure, so the suite can drive every branch without a repository.
 */

/** The label that marks an issue as the report's own, and the only thing it ever looks up by. */
export const REPORT_LABEL = 'smoke-live';

/** The title every issue the report opens starts with. */
export const TITLE_PREFIX = 'smoke-live failed';

/**
 * @typedef {object} OpenIssue
 * @property {number} number
 * @property {string} title
 * @property {readonly { name: string }[]} labels
 */

/**
 * @typedef {{ kind: 'none' }
 *   | { kind: 'open', title: string, body: string }
 *   | { kind: 'comment', number: number, body: string }} ReportAction
 */

/**
 * @typedef {object} SuiteRun
 * @property {number} exitCode what the suite exited with
 * @property {string} date `YYYY-MM-DD`
 * @property {string | null} runUrl the CI run, when there is one
 */

/**
 * Whether an issue is one the report opened: its label **and** its title.
 *
 * Both, because a label can be put on anything by anybody, and an issue a person opened about the
 * suite — "smoke-live is flaky" — must never become the one it comments on after every failure.
 *
 * @param {OpenIssue} issue
 */
export function isReportIssue(issue) {
  return (
    issue.labels.some((label) => label.name === REPORT_LABEL) &&
    issue.title.startsWith(TITLE_PREFIX)
  );
}

/**
 * What to do about one run.
 *
 * @param {SuiteRun} run
 * @param {readonly OpenIssue[]} openIssues the open issues carrying {@link REPORT_LABEL}
 * @returns {ReportAction}
 */
export function planReport(run, openIssues) {
  if (run.exitCode === 0) {
    return { kind: 'none' };
  }

  const body = describe(run);
  const existing = openIssues.find(isReportIssue);

  if (existing !== undefined) {
    return { kind: 'comment', number: existing.number, body };
  }

  return { kind: 'open', title: `${TITLE_PREFIX} — ${run.date}`, body };
}

/**
 * The text of the report: what failed, when, and where to look.
 *
 * @param {SuiteRun} run
 */
function describe(run) {
  return [
    `\`smoke-live\` exited with ${String(run.exitCode)} on ${run.date}.`,
    '',
    run.runUrl === null ? 'Run locally with `pnpm test:e2e:live`.' : `Run: ${run.runUrl}`,
    '',
    'This suite talks to the real Claude: a failure here is most often the Agent SDK changing its',
    'contract. See docs/plans/01-live-session/F6-e2e.md and e2e/smoke-live/README.md.',
  ].join('\n');
}

/**
 * The `gh` arguments that carry an action out, or `null` for none.
 *
 * @param {ReportAction} action
 * @returns {string[] | null}
 */
export function ghArgs(action) {
  if (action.kind === 'open') {
    return [
      'issue',
      'create',
      '--title',
      action.title,
      '--body',
      action.body,
      '--label',
      REPORT_LABEL,
    ];
  }

  if (action.kind === 'comment') {
    return ['issue', 'comment', String(action.number), '--body', action.body];
  }

  return null;
}

/** The `gh` arguments that list the open issues the report may own. */
export const LIST_ARGS = [
  'issue',
  'list',
  '--state',
  'open',
  '--label',
  REPORT_LABEL,
  '--json',
  'number,title,labels',
];

/**
 * The open issues `gh issue list --json` answered.
 *
 * @param {string} stdout
 * @returns {OpenIssue[] | null} `null` when the answer is not a list of issues
 */
export function parseIssues(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }

  return Array.isArray(parsed) ? /** @type {OpenIssue[]} */ (parsed) : null;
}

/**
 * Whether a Claude is signed in for the suite to talk to.
 *
 * The login the CLI stored on this machine, or the token the CLI itself reads from its environment
 * when a machine is signed in that way (`claude setup-token`). On macOS the stored login lives in the keychain, which
 * no file check can see, so the run goes ahead and a missing login shows up as the failure it is.
 *
 * @param {object} probe
 * @param {Readonly<Record<string, string | undefined>>} probe.env
 * @param {string} probe.platform
 * @param {boolean} probe.credentialFileExists
 */
export function hasClaudeLogin({ env, platform, credentialFileExists }) {
  const token = env['CLAUDE_CODE_OAUTH_TOKEN'] ?? env['ANTHROPIC_API_KEY'] ?? '';

  return credentialFileExists || token !== '' || platform === 'darwin';
}
