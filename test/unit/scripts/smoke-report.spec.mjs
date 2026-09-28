import { describe, expect, it } from 'vitest';

import {
  ghArgs,
  hasClaudeLogin,
  isReportIssue,
  LIST_ARGS,
  REPORT_LABEL,
  parseIssues,
  planReport,
  TITLE_PREFIX,
} from '../../../scripts/lib/smoke-report.mjs';

const failed = { exitCode: 1, date: '2026-09-27', runUrl: 'https://ci.test/runs/7' };
const passed = { ...failed, exitCode: 0 };

/** @param {number} number @param {string} title @param {string[]} labels */
const issue = (number, title, labels = [REPORT_LABEL]) => ({
  number,
  title,
  labels: labels.map((name) => ({ name })),
});

describe('planReport', () => {
  // S-38
  it('does nothing on a green run — not even close the issue it opened', () => {
    expect(planReport(passed, [issue(3, `${TITLE_PREFIX} — 2026-09-26`)])).toEqual({
      kind: 'none',
    });
  });

  // S-37
  it('opens an issue when the suite fails and none of its own is open', () => {
    const action = planReport(failed, []);

    expect(action).toMatchObject({ kind: 'open', title: `${TITLE_PREFIX} — 2026-09-27` });
    expect(action.kind === 'open' && action.body).toContain('https://ci.test/runs/7');
  });

  it('comments on its own open issue rather than opening a second one', () => {
    expect(planReport(failed, [issue(3, `${TITLE_PREFIX} — 2026-09-26`)])).toMatchObject({
      kind: 'comment',
      number: 3,
    });
  });

  it('never adopts an issue somebody else labelled, whatever it is about', () => {
    expect(planReport(failed, [issue(9, 'smoke-live is flaky')])).toMatchObject({ kind: 'open' });
  });

  it('says how to reproduce it when there is no CI run to link', () => {
    const action = planReport({ ...failed, runUrl: null }, []);

    expect(action.kind === 'open' && action.body).toContain('pnpm test:e2e:live');
  });
});

describe('isReportIssue', () => {
  it('needs both the label and the title', () => {
    expect(isReportIssue(issue(1, `${TITLE_PREFIX} — x`))).toBe(true);
    expect(isReportIssue(issue(1, `${TITLE_PREFIX} — x`, ['bug']))).toBe(false);
    expect(isReportIssue(issue(1, 'something else'))).toBe(false);
  });
});

describe('ghArgs', () => {
  it('opens with the label that makes the issue findable the next night', () => {
    expect(ghArgs({ kind: 'open', title: 't', body: 'b' })).toEqual([
      'issue',
      'create',
      '--title',
      't',
      '--body',
      'b',
      '--label',
      REPORT_LABEL,
    ]);
  });

  it('comments by number', () => {
    expect(ghArgs({ kind: 'comment', number: 3, body: 'b' })).toEqual([
      'issue',
      'comment',
      '3',
      '--body',
      'b',
    ]);
  });

  it('has nothing to run for no action', () => {
    expect(ghArgs({ kind: 'none' })).toBeNull();
  });

  it('lists only open issues with its label', () => {
    expect(LIST_ARGS).toEqual(expect.arrayContaining(['--state', 'open', '--label', REPORT_LABEL]));
  });
});

describe('parseIssues', () => {
  it('reads the list gh answers', () => {
    expect(parseIssues('[{"number":1,"title":"t","labels":[]}]')).toEqual([
      { number: 1, title: 't', labels: [] },
    ]);
  });

  it.each([['not json'], ['{"number":1}'], ['']])('refuses %j', (stdout) => {
    expect(parseIssues(stdout)).toBeNull();
  });
});

describe('hasClaudeLogin', () => {
  const nobody = { env: {}, platform: 'linux', credentialFileExists: false };

  it('finds the login stored on the machine', () => {
    expect(hasClaudeLogin({ ...nobody, credentialFileExists: true })).toBe(true);
  });

  it.each([['CLAUDE_CODE_OAUTH_TOKEN'], ['ANTHROPIC_API_KEY']])(
    'takes the token the CLI reads from %s, as a CI runner has it',
    (variable) => {
      expect(hasClaudeLogin({ ...nobody, env: { [variable]: 'x' } })).toBe(true);
    },
  );

  it('does not take an empty token for a login', () => {
    expect(hasClaudeLogin({ ...nobody, env: { CLAUDE_CODE_OAUTH_TOKEN: '' } })).toBe(false);
  });

  it('refuses a Linux machine with neither', () => {
    expect(hasClaudeLogin(nobody)).toBe(false);
  });

  it('lets macOS go ahead, where the login is in the keychain', () => {
    expect(hasClaudeLogin({ ...nobody, platform: 'darwin' })).toBe(true);
  });
});
