import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REPORT_LABEL, TITLE_PREFIX } from '../../../scripts/lib/smoke-report.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * A `gh` that records what it was asked, and answers `issue list` with what the test put in
 * `FAKE_GH_ISSUES`. `FAKE_GH_FAIL` makes every call exit 1, the way an unauthenticated `gh` does.
 */
const FAKE_GH = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
if (process.env.FAKE_GH_FAIL === '1') { process.stderr.write('not authenticated'); process.exit(1); }
if (args[0] === 'issue' && args[1] === 'list') { process.stdout.write(process.env.FAKE_GH_ISSUES || '[]'); }
`;

/**
 * `scripts/report-smoke-live.mjs`, run as a person runs it — a process with an exit code — with the
 * suite replaced by a command that exits with what the scenario needs, and the issue tracker by
 * the fake above. Everything between the two is the script's own.
 */
describe('report-smoke-live.mjs', () => {
  let bin = '';
  let log = '';

  beforeEach(() => {
    bin = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-fake-gh-'));
    log = path.join(bin, 'calls.jsonl');
    fs.writeFileSync(path.join(bin, 'gh'), FAKE_GH, { mode: 0o755 });
  });

  afterEach(() => {
    fs.rmSync(bin, { recursive: true, force: true });
  });

  /**
   * @param {number} suiteExit
   * @param {Record<string, string>} [env]
   */
  function report(suiteExit, env = {}) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, 'scripts', 'report-smoke-live.mjs'),
        '--',
        process.execPath,
        '-e',
        `process.exit(${String(suiteExit)})`,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          ...process.env,
          NO_COLOR: '1',
          PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin`,
          FAKE_GH_LOG: log,
          ...env,
        },
      },
    );

    return { code: result.status, stdout: result.stdout };
  }

  /** @returns {string[][]} every `gh` call, in order */
  const calls = () =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [];

  // S-38
  it('does nothing on a green run: gh is not called, so nothing is opened and nothing closed', () => {
    const result = report(0);

    expect(result.code).toBe(0);
    expect(calls()).toEqual([]);
  });

  // S-37
  it('opens an issue with its label when the suite fails, and exits 0 once it is reported', () => {
    const result = report(1);
    const created = calls().find((args) => args[1] === 'create');

    expect(result.code).toBe(0);
    expect(created).toEqual(expect.arrayContaining(['--label', REPORT_LABEL]));
    expect(created?.[created.indexOf('--title') + 1]).toMatch(new RegExp(`^${TITLE_PREFIX}`));
    expect(result.stdout).toContain('issue opened');
  });

  it('comments on the issue it opened on an earlier run instead of opening another', () => {
    const open = [
      { number: 12, title: `${TITLE_PREFIX} — 2026-09-26`, labels: [{ name: REPORT_LABEL }] },
    ];

    const result = report(2, { FAKE_GH_ISSUES: JSON.stringify(open) });

    expect(result.code).toBe(0);
    expect(calls().map((args) => args.slice(0, 3))).toEqual([
      ['issue', 'list', '--state'],
      ['issue', 'comment', '12'],
    ]);
  });

  it('never touches an issue somebody else opened, even one carrying its label', () => {
    const foreign = [{ number: 5, title: 'smoke-live is flaky', labels: [{ name: REPORT_LABEL }] }];

    report(1, { FAKE_GH_ISSUES: JSON.stringify(foreign) });

    expect(calls().some((args) => args.includes('5'))).toBe(false);
    expect(calls().some((args) => args[1] === 'close')).toBe(false);
  });

  it('goes red when the failure cannot be reported — the one outcome it may not hide', () => {
    const result = report(1, { FAKE_GH_FAIL: '1' });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('could not be read');
  });
});
