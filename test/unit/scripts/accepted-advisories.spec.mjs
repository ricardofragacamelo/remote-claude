import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_ADVISORIES_FILE,
  auditFindings,
  coverOf,
  judge,
  loadAccepted,
  readAccepted,
  todayOf,
} from '../../../scripts/lib/accepted-advisories.mjs';

const BRACES = {
  id: 'GHSA-vfj7-8cjw-p6xm',
  package: 'braces',
  version: '3.0.3',
  via: ['.>jscpd>'],
  adr: 'ADR-019',
  expires: '2026-11-02',
};

const FROM_JSCPD = {
  id: BRACES.id,
  package: 'braces',
  version: '3.0.3',
  paths: ['.>jscpd>@jscpd/finder>fast-glob>micromatch>braces'],
};

/**
 * `pnpm audit --json` as pnpm 10 answers it, trimmed to what is read.
 *
 * @param {Record<string, unknown>} advisories
 */
function anAudit(advisories) {
  return JSON.stringify({ actions: [], advisories, muted: [], metadata: {} });
}

describe('the advisories gate 10 accepts for a while — ADR-019', () => {
  it('reads a whole exception, and refuses one that is not', () => {
    expect(readAccepted(JSON.stringify([BRACES]))).toEqual([BRACES]);

    expect(() => readAccepted('{}')).toThrow(/is not a list/);
    for (const broken of [
      { ...BRACES, id: 'CVE-2024-1' },
      { ...BRACES, package: '' },
      { ...BRACES, version: '' },
      { ...BRACES, via: [] },
      { ...BRACES, via: ['jscpd'] },
      { ...BRACES, adr: 'the one about braces' },
      { ...BRACES, expires: 'next month' },
      null,
    ]) {
      expect(() => readAccepted(JSON.stringify([broken]))).toThrow(/not a whole exception/);
    }
  });

  it('loads the exceptions of a repository, and none without the file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'accepted-'));
    expect(loadAccepted(root)).toEqual([]);

    fs.mkdirSync(path.join(root, path.dirname(ACCEPTED_ADVISORIES_FILE)), { recursive: true });
    fs.writeFileSync(path.join(root, ACCEPTED_ADVISORIES_FILE), JSON.stringify([BRACES]));
    expect(loadAccepted(root)).toEqual([BRACES]);
  });

  it('reads the findings the audit stops at — high and critical — with their paths', () => {
    const stdout = anAudit({
      1: {
        github_advisory_id: BRACES.id,
        module_name: 'braces',
        severity: 'high',
        findings: [{ version: '3.0.3', paths: FROM_JSCPD.paths }],
      },
      2: {
        github_advisory_id: 'GHSA-aaaa-bbbb-cccc',
        module_name: 'left-pad',
        severity: 'moderate',
        findings: [{ version: '1.0.0', paths: ['.>left-pad'] }],
      },
      3: { github_advisory_id: 'GHSA-dddd-eeee-ffff', module_name: 'odd', severity: 'critical' },
      4: {
        github_advisory_id: 'GHSA-gggg-hhhh-iiii',
        module_name: 'bare',
        severity: 'critical',
        findings: [{ version: '2.0.0' }],
      },
    });

    expect(auditFindings(stdout)).toEqual([
      FROM_JSCPD,
      { id: 'GHSA-gggg-hhhh-iiii', package: 'bare', version: '2.0.0', paths: [] },
    ]);
    expect(auditFindings(anAudit({}))).toEqual([]);
  });

  it('refuses an answer that is not the audit — a scan that could not be read found nothing', () => {
    expect(() => auditFindings('{"error":"registry down"}')).toThrow(/did not answer/);
    expect(() => auditFindings('null')).toThrow(/did not answer/);
    expect(() => auditFindings('not json')).toThrow();
  });

  it('covers the id, the package, the version and the path it names, until its date', () => {
    expect(coverOf(FROM_JSCPD, [BRACES], '2026-10-03')).toEqual({ entry: BRACES });
    // The last day still holds; osv names no path, and the audit judges the path.
    expect(coverOf({ ...FROM_JSCPD, paths: [] }, [BRACES], '2026-11-02')).toEqual({
      entry: BRACES,
    });
  });

  it('covers nothing else: another id, another version, another way in, or after its date', () => {
    expect(coverOf({ ...FROM_JSCPD, id: 'GHSA-zzzz-zzzz-zzzz' }, [BRACES], '2026-10-03')).toEqual({
      reason: expect.stringMatching(/no exception/),
    });
    expect(coverOf({ ...FROM_JSCPD, version: '3.0.2' }, [BRACES], '2026-10-03')).toEqual({
      reason: expect.stringMatching(/no exception/),
    });
    expect(
      coverOf({ ...FROM_JSCPD, paths: ['.>web>micromatch>braces'] }, [BRACES], '2026-10-03'),
    ).toEqual({ reason: expect.stringMatching(/reached outside what ADR-019 accepts/) });
    expect(coverOf(FROM_JSCPD, [BRACES], '2026-11-03')).toEqual({
      reason: 'the exception of ADR-019 ended on 2026-11-02',
    });
  });

  it('fails on what nothing covers and says aloud what it lets through', () => {
    const other = { ...FROM_JSCPD, id: 'GHSA-zzzz-zzzz-zzzz', package: 'x', version: '1.0.0' };

    const judged = judge([FROM_JSCPD, other], [BRACES], '2026-10-03');

    expect(judged.accepted).toEqual([
      'braces@3.0.3 GHSA-vfj7-8cjw-p6xm — accepted by ADR-019 until 2026-11-02',
    ]);
    expect(judged.failing).toEqual([other]);
    expect(judged.reasons).toEqual([
      'x@1.0.0 GHSA-zzzz-zzzz-zzzz — no exception — update the dependency; never ignore the advisory id',
    ]);
  });

  it('writes today as the exceptions do', () => {
    expect(todayOf(new Date('2026-10-03T23:59:00Z'))).toBe('2026-10-03');
    expect(todayOf()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
