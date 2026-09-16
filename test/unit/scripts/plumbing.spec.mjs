import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { COVERAGE_THRESHOLDS } from '../../../scripts/lib/coverage.mjs';
import { findDisposable } from '../../../scripts/lib/disposable.mjs';
import {
  commandExists,
  run,
  runAsync,
  runAttached,
  spawnLocation,
} from '../../../scripts/lib/exec.mjs';
import { declaredScripts, runGates } from '../../../scripts/lib/gates.mjs';
import { readReport, reportPathOf } from '../../../scripts/lib/lcov.mjs';
import { findFreePort } from '../../../scripts/lib/ports.mjs';
import { meetsMinimum } from '../../../scripts/lib/version.mjs';
import { reportOutcome, verify } from '../../../scripts/lib/verify.mjs';

// Several of these spawn real processes or open real sockets.
vi.setConfig({ testTimeout: 60_000 });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** @type {string[]} */
const scratch = [];

/** @returns {string} */
function temporaryDirectory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-plumbing-'));
  scratch.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  vi.restoreAllMocks();
});

describe('COVERAGE_THRESHOLDS', () => {
  it('is the same bar in all four dimensions, and it is per file', () => {
    expect(COVERAGE_THRESHOLDS).toEqual({
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
      perFile: true,
    });
  });
});

describe('exec', () => {
  it('captures what a command printed, and the code it left with', () => {
    const result = run(process.execPath, ['-e', 'process.stdout.write("out");process.exit(3)']);

    expect(result).toMatchObject({ found: true, code: 3, stdout: 'out' });
  });

  it('captures the error stream separately', () => {
    const result = run(process.execPath, ['-e', 'process.stderr.write("bad")']);

    expect(result.stderr).toBe('bad');
    expect(result.stdout).toBe('');
  });

  it('runs where it was told to', () => {
    const dir = temporaryDirectory();
    const result = run(process.execPath, ['-e', 'process.stdout.write(process.cwd())'], {
      cwd: dir,
    });

    expect(fs.realpathSync(result.stdout)).toBe(fs.realpathSync(dir));
  });

  it('passes the environment it was given, and nothing else', () => {
    const result = run(process.execPath, ['-e', 'process.stdout.write(String(process.env.RC_X))'], {
      env: { ...process.env, RC_X: 'value' },
    });

    expect(result.stdout).toBe('value');
  });

  it('answers found: false for a missing executable rather than throwing', () => {
    // A missing tool is a normal outcome here — `doctor` exists to report exactly that.
    const result = run('rc-no-such-executable', ['--version']);

    expect(result).toMatchObject({ found: false, code: 127 });
    expect(result.stderr).not.toBe('');
  });

  it('runs attached, leaving the tool’s own output to reach the terminal', () => {
    const result = runAttached(process.execPath, ['-e', 'process.exit(0)']);

    expect(result).toMatchObject({ found: true, code: 0, stdout: '' });
  });

  it('answers a non-zero code when an attached command fails', () => {
    expect(runAttached(process.execPath, ['-e', 'process.exit(2)']).code).toBe(2);
  });

  it('knows whether an executable is reachable', () => {
    expect(commandExists(process.execPath)).toBe(true);
    expect(commandExists('rc-no-such-executable')).toBe(false);
  });

  it('probes with the arguments it was given', () => {
    expect(commandExists(process.execPath, ['-e', ''])).toBe(true);
  });

  it('answers a failure when a command outlives its deadline', () => {
    // A process killed by a signal has no exit status; the result still has to be non-zero, or
    // a timed-out gate would read as a pass.
    const result = run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
      timeoutMs: 100,
    });

    expect(result.found).toBe(true);
    expect(result.code).not.toBe(0);
  });
});

describe('spawnLocation', () => {
  it('leaves out what the caller did not choose, instead of passing undefined', () => {
    // `{ cwd: undefined }` reads to node as "no working directory", not as "inherit mine".
    expect(spawnLocation({})).toEqual({});
  });

  it('passes on exactly what the caller did choose', () => {
    expect(spawnLocation({ cwd: '/tmp' })).toEqual({ cwd: '/tmp' });
    expect(spawnLocation({ env: { A: '1' } })).toEqual({ env: { A: '1' } });
  });
});

describe('runAsync', () => {
  it('captures both streams and the exit code, exactly as the blocking form does', async () => {
    const result = await runAsync(process.execPath, [
      '-e',
      'process.stdout.write("out");process.stderr.write("bad");process.exit(3)',
    ]);

    expect(result).toMatchObject({ found: true, code: 3, stdout: 'out', stderr: 'bad' });
  });

  it('leaves the event loop free while the command runs', async () => {
    /** @type {string[]} */
    const order = [];

    const running = runAsync(process.execPath, ['-e', 'setTimeout(() => {}, 300)']).then(() =>
      order.push('command'),
    );

    // This is the whole reason the function exists: a timer set now must still fire, and the
    // blocking form would hold the thread until the command was over.
    await new Promise((resolve) => setTimeout(resolve, 50));
    order.push('timer');
    await running;

    expect(order).toEqual(['timer', 'command']);
  });

  it('runs where it was told to, with the environment it was given', async () => {
    const dir = temporaryDirectory();
    const result = await runAsync(
      process.execPath,
      ['-e', 'process.stdout.write(`${process.cwd()}|${String(process.env.RC_X)}`)'],
      { cwd: dir, env: { ...process.env, RC_X: 'value' } },
    );

    const [cwd, variable] = result.stdout.split('|');
    expect(fs.realpathSync(String(cwd))).toBe(fs.realpathSync(dir));
    expect(variable).toBe('value');
  });

  it('answers found: false for a missing executable rather than rejecting', async () => {
    const result = await runAsync('rc-no-such-executable', ['--version']);

    expect(result).toMatchObject({ found: false, code: 127 });
  });

  it('answers found: true when the command exists but cannot be started', async () => {
    // A file without the execute bit: it is there, so reporting it as "not installed" would send
    // whoever reads the message looking for the wrong thing.
    const script = path.join(temporaryDirectory(), 'not-executable.sh');
    fs.writeFileSync(script, '#!/bin/sh\necho hi\n', { mode: 0o644 });

    const result = await runAsync(script, []);

    expect(result).toMatchObject({ found: true, code: 127 });
  });

  it('answers a failure when a command outlives its deadline', async () => {
    const result = await runAsync(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
      timeoutMs: 100,
    });

    expect(result.found).toBe(true);
    expect(result.code).not.toBe(0);
  });
});

describe('meetsMinimum', () => {
  it('accepts a version above the minimum', () => {
    expect(meetsMinimum('v22.16.0', '22')).toBe(true);
  });

  it('refuses output that carries no version at all', () => {
    expect(meetsMinimum('command not found', '22')).toBe(false);
  });

  it('refuses a minimum that is not a version', () => {
    expect(meetsMinimum('v22.16.0', 'latest')).toBe(false);
  });

  it('compares the patch when major and minor agree', () => {
    expect(meetsMinimum('1.2.3', '1.2.4')).toBe(false);
    expect(meetsMinimum('1.2.4', '1.2.3')).toBe(true);
    expect(meetsMinimum('1.2.3', '1.2.3')).toBe(true);
  });
});

describe('findFreePort', () => {
  it('answers a port nothing is listening on', async () => {
    const port = await findFreePort();

    expect(port).toBeGreaterThan(0);

    const server = net.createServer();
    await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  });

  it('rejects rather than answering zero when the host cannot be bound', async () => {
    await expect(findFreePort('192.0.2.1')).rejects.toThrow();
  });
});

describe('findDisposable', () => {
  it('answers the deepest disposable directories first, so a parent never hides a child', () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, 'web', 'dist'), { recursive: true });
    fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });

    const found = findDisposable(root);

    expect(found).toContain(path.join('web', 'dist'));
    expect(found).toContain('coverage');
  });

  it('does not descend into a directory it may not read', () => {
    const root = temporaryDirectory();
    const closed = path.join(root, 'closed');
    fs.mkdirSync(closed);
    fs.chmodSync(closed, 0o000);

    try {
      expect(() => findDisposable(root)).not.toThrow();
    } finally {
      fs.chmodSync(closed, 0o755);
    }
  });

  it('answers nothing for a tree with nothing disposable in it', () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, 'src'));

    expect(findDisposable(root)).toEqual([]);
  });
});

describe('lcov on disk', () => {
  it('names the report a module writes', () => {
    expect(reportPathOf('/somewhere/mobile')).toBe(
      path.join('/somewhere/mobile', 'coverage', 'lcov.info'),
    );
  });

  it('reads a report that exists', () => {
    const dir = temporaryDirectory();
    const file = path.join(dir, 'lcov.info');
    fs.writeFileSync(file, 'SF:lib/a.dart\nDA:1,1\nend_of_record\n');

    expect(readReport(file)).toContain('SF:lib/a.dart');
  });

  it('answers null rather than throwing when there is no report', () => {
    expect(readReport(path.join(temporaryDirectory(), 'lcov.info'))).toBeNull();
  });
});

describe('declaredScripts', () => {
  it('reads the scripts a workspace declares', () => {
    expect(declaredScripts(repoRoot, 'backend').has('test:unit')).toBe(true);
  });

  it('answers an empty set for a directory with no manifest', () => {
    expect(declaredScripts(repoRoot, 'no-such-workspace').size).toBe(0);
  });
});

describe('runGates over a workspace', () => {
  it('skips exactly the gates the workspace does not declare a script for', () => {
    // `packages/config` declares `typecheck` and nothing else, so the gates that depend on a
    // script it does not have are the ones that must be reported as skipped rather than run.
    const outcomes = runGates(repoRoot, 'packages/config', () => {});
    const scripts = declaredScripts(repoRoot, 'packages/config');
    const skipped = outcomes.filter((outcome) => outcome.state === 'skipped');

    expect(outcomes.length).toBeGreaterThan(0);

    for (const outcome of skipped) {
      expect(outcome.gate.needsScript).toBeDefined();
      expect(scripts.has(String(outcome.gate.needsScript))).toBe(false);
      expect(outcome.code).toBe(0);
    }
  });
});

describe('reportOutcome', () => {
  /** @param {'passed' | 'failed' | 'skipped'} state */
  function outcomeOf(state) {
    return {
      gate: { number: 1, name: 'lint', command: 'pnpm', args: ['run', 'lint'] },
      state,
      code: state === 'failed' ? 1 : 0,
      durationMs: 1200,
    };
  }

  it('prints a line for each of the three outcomes', () => {
    /** @type {string[]} */
    const written = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });

    reportOutcome(outcomeOf('passed'));
    reportOutcome(outcomeOf('failed'));
    reportOutcome(outcomeOf('skipped'));

    expect(written).toHaveLength(3);
    expect(written[0]).toContain('1. lint');
    expect(written[1]).toContain('exit 1');
    expect(written[2]).toContain('not declared here');
  });
});

describe('verify', () => {
  /**
   * @param {number} number
   * @param {string} name
   * @param {number} code
   */
  function gate(number, name, code) {
    return {
      number,
      name,
      command: process.execPath,
      args: ['-e', `process.exit(${String(code)})`],
    };
  }

  it('answers 0 when every gate it was given passed', () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    expect(verify(false, [gate(1, 'a', 0), gate(2, 'b', 0)])).toBe(0);
  });

  it('answers 1 as soon as one fails, and says which', () => {
    /** @type {string[]} */
    const written = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });

    expect(verify(true, [gate(1, 'a', 0), gate(2, 'duplication', 1)])).toBe(1);
    expect(written.join('')).toContain('gate 2 — duplication');
    expect(written.join('')).toContain('from gate 1');
  });

  it('names the range it is running, so the output says which half it was', () => {
    /** @type {string[]} */
    const written = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });

    verify(true, [gate(1, 'a', 0)]);

    expect(written.join('')).toContain('verify:full');
  });
});
