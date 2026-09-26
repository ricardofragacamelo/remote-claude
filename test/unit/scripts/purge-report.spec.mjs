import { describe, expect, it } from 'vitest';

import { describePurge, parsePurgeReport } from '../../../scripts/lib/purge-report.mjs';

/** @type {import('../../../scripts/lib/purge-report.mjs').PurgeSummary} */
const completed = {
  status: 'completed',
  purgeId: 'purge-1',
  triggeredBy: 'cli',
  retentionDays: 90,
  cutoff: '2026-06-26T12:00:00.000Z',
  reason: null,
  trails: [
    { trail: 'entries', deleted: 1200, error: null },
    { trail: 'events', deleted: 0, error: null },
  ],
};

describe('parsePurgeReport', () => {
  it('reads the last line the command printed', () => {
    const stdout = `something above\n${JSON.stringify(completed)}\n\n`;

    expect(parsePurgeReport(stdout)).toEqual(completed);
  });

  it("finds the report above pnpm's own complaint about the exit code", () => {
    const stdout = `${JSON.stringify(completed)}\nundefined\n/repo/backend:\n ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed\n{not json\n`;

    expect(parsePurgeReport(stdout)).toEqual(completed);
  });

  it('answers null when there is no report — the command died before writing one', () => {
    expect(parsePurgeReport('')).toBeNull();
    expect(parsePurgeReport('  \n')).toBeNull();
    expect(parsePurgeReport('Error: boom')).toBeNull();
    expect(parsePurgeReport('42')).toBeNull();
    expect(parsePurgeReport('{broken')).toBeNull();
    expect(parsePurgeReport('{"applied":[]}')).toBeNull();
  });
});

describe('describePurge', () => {
  it('says what went from each trail, and up to when — S-89', () => {
    expect(describePurge(completed)).toEqual([
      {
        kind: 'ok',
        text: 'tool invocations: 1200 removed, nothing left before 2026-06-26T12:00:00.000Z',
      },
      {
        kind: 'ok',
        text: 'account events: 0 removed, nothing left before 2026-06-26T12:00:00.000Z',
      },
    ]);
  });

  it('says what did not go, why, and that running again is safe — S-40', () => {
    const lines = describePurge({
      ...completed,
      status: 'failed',
      trails: [
        { trail: 'entries', deleted: 2000, error: 'connection terminated' },
        { trail: 'events', deleted: 3, error: null },
      ],
    });

    expect(lines[0]).toEqual({
      kind: 'fail',
      text: 'tool invocations: 2000 removed, then refused — rows before 2026-06-26T12:00:00.000Z remain: connection terminated',
    });
    expect(lines[1]?.kind).toBe('ok');
    expect(lines.slice(2).map((line) => line.kind)).toEqual(['hint', 'hint']);
    expect(lines[2]?.text).toContain('purge-1');
    expect(lines[3]?.text).toContain('removes nothing twice');
  });

  it('says a purge that lost the lock removed nothing, and why — S-90', () => {
    const lines = describePurge({
      status: 'skipped',
      reason: 'alreadyRunning',
      triggeredBy: 'cli',
      retentionDays: 90,
      cutoff: '2026-06-26T12:00:00.000Z',
      purgeId: null,
      trails: [],
    });

    expect(lines.map((line) => line.kind)).toEqual(['ok', 'hint']);
    expect(lines[0]?.text).toContain('removed nothing');
  });

  it('says a purge that never started removed nothing at all — S-91', () => {
    const lines = describePurge({
      status: 'notStarted',
      triggeredBy: 'cli',
      retentionDays: 120,
      error: 'connect ECONNREFUSED 127.0.0.1:1',
    });

    expect(lines[0]).toEqual({
      kind: 'fail',
      text: 'the purge could not start: connect ECONNREFUSED 127.0.0.1:1',
    });
    expect(lines[1]?.text).toBe(
      'nothing was removed — every row older than 120 days is still there',
    );
  });

  it('does not invent what the report left out', () => {
    expect(describePurge({ status: 'notStarted', retentionDays: 90 })[0]?.text).toContain(
      'unknown error',
    );
    expect(describePurge({ status: 'completed', retentionDays: 90 })).toEqual([]);
    expect(
      describePurge({
        status: 'completed',
        retentionDays: 90,
        trails: [{ trail: 'events', deleted: 1, error: null }],
      })[0]?.text,
    ).toContain('before the cutoff');
  });
});
