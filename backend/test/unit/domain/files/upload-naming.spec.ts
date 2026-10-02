import { describe, expect, it } from 'vitest';

import {
  FilePath,
  KEEP_BOTH_ATTEMPTS,
  WINDOWS_RESERVED_NAMES,
  isReservedOnWindows,
  keepBothName,
} from '@domain/files';

const rulesOf = (raw: string): string[] =>
  FilePath.uploadViolations(raw, 'manifest.0.path').map((violation) => violation.rule);

/** The names an upload may write — plan 07, B-49, S-306, S-357. */
describe('FilePath.uploadViolations', () => {
  it.each(['a.txt', 'docs/guide.md', 'a/b/c/d.bin', 'açaí café.md', '.env', 'con-tract.txt'])(
    'accepts %s',
    (raw) => {
      expect(rulesOf(raw)).toEqual([]);
    },
  );

  it('refuses a name that climbs, even when it would land inside — S-306', () => {
    expect(rulesOf('../evil.sh')).toEqual(['mustNotClimb']);
    expect(rulesOf('a/../b.txt')).toEqual(['mustNotClimb']);
  });

  it('refuses an absolute path, a NUL and a backslash — S-357', () => {
    expect(rulesOf('/etc/passwd')).toEqual(['mustBeRelative']);
    expect(rulesOf('a\0.txt')).toEqual(['mustNotContainNul']);
    expect(rulesOf('a\\b.txt')).toEqual(['mustNotContainBackslash']);
  });

  it('refuses an empty segment, a `.` and a trailing slash', () => {
    expect(rulesOf('a//b.txt')).toEqual(['mustNotHaveEmptySegment']);
    expect(rulesOf('./a.txt')).toEqual(['mustNotHaveEmptySegment']);
    expect(rulesOf('a/')).toEqual(['mustNotHaveEmptySegment']);
  });

  it('refuses a segment longer than a filesystem holds — fron', () => {
    expect(rulesOf(`${'a'.repeat(255)}/b`)).toEqual([]);
    expect(rulesOf(`${'a'.repeat(256)}/b`)).toEqual(['segmentTooLong']);
  });

  it('reports every rule a path breaks, with the field it came in', () => {
    expect(FilePath.uploadViolations('/a/../CON/x\\y', 'manifest.3.path')).toEqual([
      { field: 'manifest.3.path', rule: 'mustBeRelative' },
      { field: 'manifest.3.path', rule: 'mustNotContainBackslash' },
      { field: 'manifest.3.path', rule: 'mustNotClimb' },
      { field: 'manifest.3.path', rule: 'mustNotUseReservedName' },
    ]);
  });

  it('refuses a name Windows reserves, in any segment — S-357', () => {
    expect(rulesOf('src/nul/a.txt')).toEqual(['mustNotUseReservedName']);
    expect(rulesOf('LPT9.log')).toEqual(['mustNotUseReservedName']);
  });
});

describe('isReservedOnWindows', () => {
  it.each([
    'CON',
    'con',
    'Con.txt',
    'PRN',
    'AUX.tar.gz',
    'NUL',
    'COM1',
    'com9',
    'LPT1',
    'CON .txt',
  ])('reserves %s', (segment) => {
    expect(isReservedOnWindows(segment)).toBe(true);
  });

  it.each(['CONSOLE', 'COM0', 'COM10', 'LPT', 'my.con', 'nul-thing', ''])(
    'leaves %s alone',
    (segment) => {
      expect(isReservedOnWindows(segment)).toBe(false);
    },
  );

  it('knows the 22 names of Windows', () => {
    expect(WINDOWS_RESERVED_NAMES).toHaveLength(22);
  });
});

/** "Keep both" — plan 07, B-49, S-303. */
describe('keepBothName', () => {
  it('names the first copy `name copy.ext`, and the next ones with a number', () => {
    expect(keepBothName('report.pdf', 1)).toBe('report copy.pdf');
    expect(keepBothName('report.pdf', 2)).toBe('report copy 2.pdf');
    expect(keepBothName('report.pdf', KEEP_BOTH_ATTEMPTS)).toBe(
      `report copy ${String(KEEP_BOTH_ATTEMPTS)}.pdf`,
    );
  });

  it('takes the last extension, and none from a name that starts with its only dot', () => {
    expect(keepBothName('notes.tar.gz', 1)).toBe('notes.tar copy.gz');
    expect(keepBothName('.env', 1)).toBe('.env copy');
    expect(keepBothName('Makefile', 3)).toBe('Makefile copy 3');
  });

  it('shortens a stem that would not fit in one segment, a character at a time — fron', () => {
    const name = `${'é'.repeat(200)}.txt`;
    const copy = keepBothName(name, 12);

    expect(Buffer.byteLength(copy, 'utf8')).toBeLessThanOrEqual(255);
    expect(copy.endsWith(' copy 12.txt')).toBe(true);
    expect(copy.startsWith('é')).toBe(true);
  });
});
