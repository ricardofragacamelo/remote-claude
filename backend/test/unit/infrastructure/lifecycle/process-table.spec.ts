import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseEnviron, ProcfsProcessTable } from '@infra/lifecycle/process-table';

/** A fake `/proc`, with the processes a test says and a file that is not a process. */
function aProcRoot(processes: Readonly<Record<string, string | null>>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'rc-proc-'));
  writeFileSync(path.join(root, 'uptime'), '1 1', 'utf8');

  for (const [pid, environ] of Object.entries(processes)) {
    mkdirSync(path.join(root, pid));
    if (environ !== null) {
      writeFileSync(path.join(root, pid, 'environ'), environ, 'utf8');
    }
  }

  return root;
}

describe('parseEnviron', () => {
  it('reads NUL-separated pairs', () => {
    expect([...parseEnviron('A=1\0B=two=2\0')]).toEqual([
      ['A', '1'],
      ['B', 'two=2'],
    ]);
  });

  it('skips what is not a pair', () => {
    expect([...parseEnviron('\0=nameless\0JUNK\0')]).toEqual([]);
  });
});

describe('ProcfsProcessTable', () => {
  it('lists the processes it may read, and only processes', async () => {
    const root = aProcRoot({ '10': 'A=1\0', '11': 'B=2\0' });

    const entries = await new ProcfsProcessTable(root).list();

    expect(entries?.map((entry) => entry.pid).sort()).toEqual([10, 11]);
    expect(entries?.find((entry) => entry.pid === 10)?.environment.get('A')).toBe('1');
  });

  it('skips a process whose environment cannot be read — somebody else, or gone', async () => {
    const root = aProcRoot({ '10': 'A=1\0', '12': null });

    expect((await new ProcfsProcessTable(root).list())?.map((entry) => entry.pid)).toEqual([10]);
  });

  it('answers null where there is no process table to read', async () => {
    expect(await new ProcfsProcessTable('/nowhere/at/all').list()).toBeNull();
  });

  it('knows this process is alive and a pid nobody has is not', () => {
    const table = new ProcfsProcessTable();

    expect(table.isAlive(process.pid)).toBe(true);
    expect(table.isAlive(2 ** 22 + 1)).toBe(false);
  });

  it('counts a process it may not signal as alive — somebody else, not ours to touch', () => {
    // pid 1 exists on every Linux box and belongs to root.
    expect(new ProcfsProcessTable().isAlive(1)).toBe(true);
  });

  it('treats signalling a process that is gone as nothing at all', () => {
    expect(() => {
      new ProcfsProcessTable().signal(2 ** 22 + 1, 'SIGTERM');
    }).not.toThrow();
  });
});
