import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { run } from '../../../scripts/lib/exec.mjs';

vi.setConfig({ testTimeout: 120_000 });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** @param {readonly string[]} args */
function spike(args) {
  return run(process.execPath, [path.join(repoRoot, 'scripts', 'watcher-spike.mjs'), ...args], {
    cwd: repoRoot,
    timeoutMs: 110_000,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

/**
 * The spike as the terminal runs it (plan 07, B-19): over a small tree, with no library installed
 * in `--libs`, `fs.watch` is measured and the other two are said to be missing — never a crash.
 */
describe('watcher-spike.mjs', () => {
  it('says how to run it, and refuses to run without a tree', () => {
    expect(spike(['--help']).code).toBe(0);

    const missing = spike([]);

    expect(missing.code).toBe(2);
    expect(missing.stdout).toContain('--tree and --libs are required');
  });

  it('measures fs.watch over a tree and reports the libraries it does not find', () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-spike-'));
    fs.mkdirSync(path.join(tree, 'src', 'deep'), { recursive: true });
    fs.mkdirSync(path.join(tree, 'node_modules', 'pkg'), { recursive: true });
    const libs = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-spike-libs-'));

    const result = spike(['--tree', tree, '--libs', libs, '--json']);
    const reports = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '[]');

    expect(result.code).toBe(0);
    expect(reports.map((/** @type {{ option: string }} */ report) => report.option)).toEqual([
      'fs',
      'chokidar',
      'parcel',
    ]);
    expect(reports[0]).toMatchObject({ status: 'measured', events: { watched: 1 } });
    expect(reports[0].watches).toBeGreaterThan(0);
    expect(reports[1]).toMatchObject({ status: 'missing' });
    expect(reports[2]).toMatchObject({ status: 'missing' });
    fs.rmSync(tree, { recursive: true, force: true });
  });
});
