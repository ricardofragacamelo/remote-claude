import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LOCKFILES,
  OSV_IMAGE,
  findingsOf,
  interpretOsv,
  lockfilePath,
  osvInvocation,
  scannedLockfiles,
} from '../../../scripts/lib/osv.mjs';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/osv');

/**
 * A run of the scanner, as `scripts/record-osv-fixtures.mjs` recorded it.
 *
 * @param {string} name
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function recorded(name) {
  const recording = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));

  return {
    code: recording.exitCode,
    stdout: JSON.stringify(recording.stdout),
    stderr: recording.stderr,
  };
}

/** How the recordings were made: the image, with the fixtures mounted at `/src`. */
const fixtureRun = osvInvocation({
  hasBinary: false,
  root: FIXTURES,
  lockfiles: ['package-lock.json:boundary.package-lock.json'],
});

/** @param {string} name */
const expecting = (name) => ({
  lockfiles: [`${name}.package-lock.json`],
  toRepository: fixtureRun.toRepository,
});

describe('osvInvocation', () => {
  it('runs the local binary over both lockfiles of the product when there is one (S-74)', () => {
    const invocation = osvInvocation({ hasBinary: true, root: '/repo' });

    expect(invocation.command).toBe('osv-scanner');
    expect(invocation.args).toEqual([
      'scan',
      'source',
      '--format',
      'json',
      '--lockfile',
      '/repo/pnpm-lock.yaml',
      '--lockfile',
      '/repo/mobile/pubspec.lock',
    ]);
  });

  it('falls back to the pinned image, with the repository mounted read-only', () => {
    const invocation = osvInvocation({ hasBinary: false, root: '/repo' });

    expect(invocation.command).toBe('docker');
    expect(invocation.args.slice(0, 5)).toEqual([
      'run',
      '--rm',
      '--volume',
      '/repo:/src:ro',
      OSV_IMAGE,
    ]);
    expect(invocation.args).toContain('/src/mobile/pubspec.lock');
  });

  it('keeps the parser of a typed lockfile and moves only its path', () => {
    const invocation = osvInvocation({
      hasBinary: false,
      root: '/repo',
      lockfiles: ['package-lock.json:fixtures/a.lock'],
    });

    expect(invocation.args).toContain('package-lock.json:/src/fixtures/a.lock');
  });

  it('maps what the scanner prints back to paths of the repository', () => {
    expect(
      osvInvocation({ hasBinary: false, root: '/repo' }).toRepository('/src/pnpm-lock.yaml'),
    ).toBe('pnpm-lock.yaml');
    expect(
      osvInvocation({ hasBinary: true, root: '/repo' }).toRepository('/repo/mobile/pubspec.lock'),
    ).toBe('mobile/pubspec.lock');
  });

  it('covers every lockfile the product has', () => {
    expect(LOCKFILES).toEqual(['pnpm-lock.yaml', 'mobile/pubspec.lock']);
  });
});

describe('interpretOsv, over what the scanner really answered', () => {
  // S-33
  it('fails a dependency with a known advisory, naming the lockfile, package, version and id', () => {
    const verdict = interpretOsv(recorded('boundary'), expecting('boundary'));

    expect(verdict.status).toBe('vulnerable');
    expect(verdict.findings).toContainEqual({
      lockfile: 'boundary.package-lock.json',
      name: 'vitest',
      version: '2.1.0',
      advisories: expect.arrayContaining(['GHSA-82fw-gwwq-j7x9']),
    });
  });

  // S-34
  it('fails the version exactly at the start of the range, and passes the one it was fixed in', () => {
    const { findings } = interpretOsv(recorded('boundary'), expecting('boundary'));
    const affected = (/** @type {string} */ version) =>
      findings.find((finding) => finding.version === version)?.advisories ?? [];

    expect(affected('2.1.0')).toContain('GHSA-82fw-gwwq-j7x9');
    expect(affected('2.0.5')).not.toContain('GHSA-82fw-gwwq-j7x9');
    expect(findings.some((finding) => finding.version === '4.1.11')).toBe(false);
  });

  it('passes a lockfile with nothing known against it', () => {
    expect(interpretOsv(recorded('clean'), expecting('clean'))).toEqual({
      status: 'clean',
      findings: [],
    });
  });
});

// S-35
describe('interpretOsv, when the scanner did not verify', () => {
  const clean = recorded('clean');

  it.each([
    ['exited with an error of its own', { ...clean, code: 127 }, 'exited with 127'],
    ['found no package to scan', { ...clean, code: 128 }, 'exited with 128'],
    ['was killed before answering', { ...clean, code: 137 }, 'exited with 137'],
    ['printed something that is not JSON', { ...clean, stdout: 'Error: boom' }, 'not its report'],
    ['printed JSON that is not its report', { ...clean, stdout: '{"oops":1}' }, 'not its report'],
    ['printed nothing at all', { ...clean, stdout: '' }, 'not its report'],
    ['never said it read the lockfile', { ...clean, stderr: '' }, 'did not read'],
    [
      'read the lockfile and found no package in it',
      { ...clean, stderr: 'Scanned /src/clean.package-lock.json file and found 0 packages' },
      'did not read',
    ],
    ['said it found something its report does not list', { ...clean, code: 1 }, 'does not list'],
  ])('is unverified — and so fails — when it %s', (_case, run, reason) => {
    const verdict = interpretOsv(run, expecting('clean'));

    expect(verdict.status).toBe('unverified');
    expect(verdict.reason).toContain(reason);
  });

  it('is unverified when only one of the two lockfiles was read (S-74)', () => {
    const verdict = interpretOsv(
      {
        code: 0,
        stdout: '{"results":[]}',
        stderr: 'Scanned /src/pnpm-lock.yaml file and found 1106 packages',
      },
      {
        lockfiles: LOCKFILES,
        toRepository: osvInvocation({ hasBinary: false, root: '/r' }).toRepository,
      },
    );

    expect(verdict).toMatchObject({
      status: 'unverified',
      reason: expect.stringContaining('mobile/pubspec.lock'),
    });
  });
});

describe('scannedLockfiles', () => {
  it('reads each lockfile the scanner opened, singular or plural', () => {
    const scanned = scannedLockfiles(
      [
        'Starting filesystem walk for root: /',
        'Scanned /src/pnpm-lock.yaml file and found 1106 packages',
        'Scanned /src/mobile/pubspec.lock file and found 1 package',
      ].join('\n'),
      osvInvocation({ hasBinary: false, root: '/r' }).toRepository,
    );

    expect([...scanned]).toEqual([
      ['pnpm-lock.yaml', 1106],
      ['mobile/pubspec.lock', 1],
    ]);
  });
});

describe('findingsOf', () => {
  it('refuses a document that is not a report', () => {
    expect(findingsOf(null, (reported) => reported)).toBeNull();
    expect(findingsOf({ results: 'no' }, (reported) => reported)).toBeNull();
  });

  it('tolerates a result with no package, and a package with no advisory list', () => {
    expect(
      findingsOf(
        { results: [{}, { source: { path: '/a' }, packages: [{ package: {} }] }] },
        (reported) => reported,
      ),
    ).toEqual([{ lockfile: '/a', name: '', version: '', advisories: [] }]);
  });
});

describe('lockfilePath', () => {
  it('drops the parser of a typed entry, and leaves a plain one alone', () => {
    expect(lockfilePath('package-lock.json:a/b.json')).toBe('a/b.json');
    expect(lockfilePath('pnpm-lock.yaml')).toBe('pnpm-lock.yaml');
  });
});
