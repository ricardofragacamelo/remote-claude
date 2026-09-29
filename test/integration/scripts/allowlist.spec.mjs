import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { withFileLock } from '../../../scripts/lib/allowlist.mjs';
import { runAllowlist } from '../../../scripts/lib/allowlist-command.mjs';
import { run } from '../../../scripts/lib/exec.mjs';

vi.setConfig({ testTimeout: 60_000 });

/**
 * `pnpm allowlist` against real files and real processes — in a directory the suite made, never
 * the developer's own copy, and signalling a process the suite spawned, never their backend
 * (plan 06, B-10, B-11).
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT = fs.readFileSync(path.join(repoRoot, 'infra', 'workspace-allowlist.yaml'), 'utf8');

/** @type {string[]} */
const temporary = [];
/** @type {import('node:child_process').ChildProcess[]} */
const spawned = [];

function tempDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rc-allowlist-cli-')));
  temporary.push(dir);
  return dir;
}

/** @type {string[]} */
let printed = [];

beforeEach(() => {
  printed = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    printed.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const child of spawned.splice(0)) {
    child.kill('SIGKILL');
  }
  for (const dir of temporary.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A place for the command to run: a default copied from the repository's, no local copy yet, a
 * project folder, and a home directory of its own.
 *
 * @param {Partial<import('../../../scripts/lib/allowlist-command.mjs').AllowlistContext>} [overrides]
 */
function aPlace(overrides = {}) {
  const dir = tempDir();
  const project = path.join(dir, 'home', 'projects', 'remote-claude');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(dir, 'default.yaml'), DEFAULT, 'utf8');

  /** @type {import('../../../scripts/lib/allowlist-command.mjs').AllowlistContext} */
  const context = {
    root: dir,
    defaultFile: path.join(dir, 'default.yaml'),
    localFile: path.join(dir, 'local.yaml'),
    env: {},
    home: path.join(dir, 'home'),
    cwd: dir,
    pidFile: null,
    ask: () => Promise.resolve(''),
    processes: {
      read: (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null),
      commandOf: () => null,
      kill: () => undefined,
    },
    ...overrides,
  };

  return { dir, project, context };
}

/** @param {string} file */
function rootsIn(file) {
  return /** @type {{ roots: { path: string, label: string, users: string[] }[] }} */ (
    parseYaml(fs.readFileSync(file, 'utf8'))
  ).roots;
}

const output = () => printed.join('');

describe('pnpm allowlist add', () => {
  it('creates the local copy from the default and frees the folder for the realm users — S-50', async () => {
    const { project, context } = aPlace();

    const code = await runAllowlist(['add', project], context);

    expect(code).toBe(0);
    expect(rootsIn(context.localFile)).toEqual([
      expect.objectContaining({ label: 'Scratch', path: '/tmp/remote-claude-workspaces' }),
      {
        path: project,
        label: 'remote-claude',
        users: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'],
      },
    ]);
    expect(fs.readFileSync(context.defaultFile, 'utf8')).toBe(DEFAULT);
  });

  it('frees it for the users named instead, when there are any', async () => {
    const { project, context } = aPlace();

    await runAllowlist(['add', project, '--user', 'auth|a', '--user', 'auth|b'], context);

    expect(rootsIn(context.localFile).at(-1)?.users).toEqual(['auth|a', 'auth|b']);
  });

  it('adds the same folder twice as once — S-51', async () => {
    const { project, context } = aPlace();

    await runAllowlist(['add', project], context);
    const first = fs.readFileSync(context.localFile, 'utf8');
    const code = await runAllowlist(['add', project], context);

    expect(code).toBe(0);
    expect(fs.readFileSync(context.localFile, 'utf8')).toBe(first);
    expect(output()).toContain('was already free');
  });

  it('expands ~ and a relative path, and shows the absolute path it wrote — S-52', async () => {
    const { project, context } = aPlace();

    await runAllowlist(['add', '~/projects/remote-claude'], context);
    await runAllowlist(['add', 'home/projects'], { ...context });

    expect(rootsIn(context.localFile).map((root) => root.path)).toEqual([
      '/tmp/remote-claude-workspaces',
      project,
      path.join(context.cwd, 'home', 'projects'),
    ]);
    expect(output()).toContain(project);
  });

  it.each([
    ['a folder that does not exist', (/** @type {string} */ dir) => path.join(dir, 'nope')],
    ['a file', (/** @type {string} */ dir) => path.join(dir, 'default.yaml')],
    ['the root of the filesystem', () => '/'],
  ])('refuses %s, exits non-zero and leaves the copy alone — S-53', async (_case, target) => {
    const { dir, context } = aPlace();

    const code = await runAllowlist(['add', target(dir)], context);

    expect(code).toBe(1);
    expect(fs.existsSync(context.localFile)).toBe(false);
    expect(output()).toContain('nothing changed');
  });

  it('asks before freeing the whole home folder, and changes nothing without a yes — S-54', async () => {
    /** @type {string[]} */
    const questions = [];
    for (const answer of ['n', '', 'maybe']) {
      const { context } = aPlace({
        ask: (question) => {
          questions.push(question);
          return Promise.resolve(answer);
        },
      });

      expect(await runAllowlist(['add', '~'], context)).toBe(1);
      expect(fs.existsSync(context.localFile)).toBe(false);
    }

    expect(questions).toHaveLength(3);
    expect(output()).toContain('read, write and run commands in all of it');
  });

  it('frees the home folder on a yes, or with --yes without asking', async () => {
    const asked = aPlace({ ask: () => Promise.resolve('y') });
    expect(await runAllowlist(['add', '~'], asked.context)).toBe(0);

    let questions = 0;
    const flagged = aPlace({
      ask: () => {
        questions += 1;
        return Promise.resolve('');
      },
    });
    expect(await runAllowlist(['add', '~', '--yes'], flagged.context)).toBe(0);
    expect(questions).toBe(0);
    expect(rootsIn(flagged.context.localFile).at(-1)?.path).toBe(flagged.context.home);
  });

  it('writes nothing the backend would refuse to boot on', async () => {
    const { project, context } = aPlace();
    fs.writeFileSync(context.localFile, 'roots:\n  - { path: /x, label: x, users: [] }\n', 'utf8');
    const before = fs.readFileSync(context.localFile, 'utf8');

    expect(await runAllowlist(['add', project], context)).toBe(1);
    expect(fs.readFileSync(context.localFile, 'utf8')).toBe(before);
    expect(output()).toContain('nothing was written');
  });

  it('warns when RC_WORKSPACE_ALLOWLIST_FILE points somewhere else', async () => {
    const { project, context } = aPlace({ env: { RC_WORKSPACE_ALLOWLIST_FILE: '/etc/rc.yaml' } });

    await runAllowlist(['add', project], context);

    expect(output()).toContain('RC_WORKSPACE_ALLOWLIST_FILE points at /etc/rc.yaml');
  });
});

describe('pnpm allowlist remove', () => {
  it('removes a folder it freed', async () => {
    const { project, context } = aPlace();
    await runAllowlist(['add', project], context);

    expect(await runAllowlist(['remove', project], context)).toBe(0);
    expect(rootsIn(context.localFile).map((root) => root.path)).toEqual([
      '/tmp/remote-claude-workspaces',
    ]);
  });

  it('exits 0 and changes nothing for a folder that is not there — S-55', async () => {
    const { project, context } = aPlace();
    await runAllowlist(['add', project], context);
    const before = fs.readFileSync(context.localFile, 'utf8');

    expect(await runAllowlist(['remove', '/srv/never'], context)).toBe(0);
    expect(fs.readFileSync(context.localFile, 'utf8')).toBe(before);
  });

  it('exits 0 when there is no local copy at all', async () => {
    const { context } = aPlace();

    expect(await runAllowlist(['remove', '/srv/never'], context)).toBe(0);
    expect(fs.existsSync(context.localFile)).toBe(false);
  });

  it('refuses to remove the last root — the backend does not boot on none', async () => {
    const { context } = aPlace();
    fs.writeFileSync(
      context.localFile,
      'roots:\n  - { path: /tmp/only, label: only, users: [u] }\n',
      'utf8',
    );

    expect(await runAllowlist(['remove', '/tmp/only'], context)).toBe(1);
    expect(rootsIn(context.localFile)).toHaveLength(1);
  });
});

describe('pnpm allowlist list', () => {
  it('says which file is active, and its roots', async () => {
    const { project, context } = aPlace();
    await runAllowlist(['add', project], context);
    printed = [];

    const code = await runAllowlist(['list'], {
      ...context,
      env: { RC_WORKSPACE_ALLOWLIST_FILE: context.localFile },
    });

    expect(code).toBe(0);
    expect(output()).toContain(`active allowlist: ${context.localFile}`);
    expect(output()).toContain(project);
  });

  it('fails on an active file it cannot read, or one the backend would refuse', async () => {
    const { context } = aPlace();
    const missing = {
      ...context,
      env: { RC_WORKSPACE_ALLOWLIST_FILE: '/definitely/not/here.yaml' },
    };
    fs.writeFileSync(context.localFile, 'roots: []\n', 'utf8');
    const invalid = { ...context, env: { RC_WORKSPACE_ALLOWLIST_FILE: context.localFile } };

    expect(await runAllowlist(['list'], missing)).toBe(1);
    expect(await runAllowlist(['list'], invalid)).toBe(1);
  });
});

describe('the arguments', () => {
  it('prints the usage on --help and exits 0', async () => {
    expect(await runAllowlist(['--help'], aPlace().context)).toBe(0);
    expect(output()).toContain('pnpm allowlist add <folder>');
  });

  it.each([[[]], [['frobnicate']], [['add']], [['remove']]])(
    'exits 1 with the usage for %o',
    async (argv) => {
      expect(await runAllowlist(argv, aPlace().context)).toBe(1);
    },
  );
});

describe('reloading the running backend — plan 06, B-11', () => {
  it('writes the copy, exits 0 and says how to reload when no backend runs — S-179', async () => {
    const { dir, project, context } = aPlace();
    const withPidFile = { ...context, pidFile: path.join(dir, '.run', 'backend.pid') };

    expect(await runAllowlist(['add', project], withPidFile)).toBe(0);
    expect(rootsIn(context.localFile).at(-1)?.path).toBe(project);
    expect(output()).toContain('no backend of `pnpm dev` is running');
    expect(output()).toContain('kill -HUP');
  });

  it('sends SIGHUP to the process of the app, which stays up — S-62, S-180', async () => {
    const { dir, project, context } = aPlace();
    const app = path.join(dir, 'main.ts');
    const marker = path.join(dir, 'reloaded');
    fs.writeFileSync(
      app,
      [
        "import { writeFileSync } from 'node:fs';",
        `process.on('SIGHUP', () => { writeFileSync(${JSON.stringify(marker)}, 'reloaded'); });`,
        "process.stdout.write('ready\\n');",
        'setInterval(() => undefined, 60_000);',
      ].join('\n'),
      'utf8',
    );
    const child = spawn(process.execPath, [app], { stdio: ['ignore', 'pipe', 'inherit'] });
    spawned.push(child);
    await new Promise((resolve) => child.stdout?.once('data', resolve));

    const pidFile = path.join(dir, '.run', 'backend.pid');
    fs.mkdirSync(path.dirname(pidFile));
    fs.writeFileSync(pidFile, `${String(child.pid)}\n`, 'utf8');

    const code = await runAllowlist(['add', project], {
      ...context,
      pidFile,
      processes: {
        ...context.processes,
        commandOf: (pid) => run('ps', ['-o', 'args=', '-p', String(pid)]).stdout,
        kill: (pid, signal) => {
          process.kill(pid, signal);
        },
      },
    });

    expect(code).toBe(0);
    await vi.waitFor(() => {
      expect(fs.existsSync(marker)).toBe(true);
    });
    expect(child.exitCode).toBeNull();
    expect(output()).toContain(`SIGHUP sent to the backend (pid ${String(child.pid)})`);
  });

  it('keeps both of two runs at the same moment — S-60', async () => {
    const { dir, context } = aPlace();
    const first = path.join(dir, 'first');
    const second = path.join(dir, 'second');
    fs.mkdirSync(first);
    fs.mkdirSync(second);

    /** @param {string} target */
    const addInAnotherProcess = (target) =>
      new Promise((resolve, reject) => {
        const script = [
          `import { runAllowlist } from ${JSON.stringify(path.join(repoRoot, 'scripts/lib/allowlist-command.mjs'))};`,
          `const context = ${JSON.stringify({ ...context, processes: undefined, ask: undefined })};`,
          'context.ask = async () => "";',
          'context.processes = { read: () => null, commandOf: () => null, kill: () => undefined };',
          `process.exitCode = await runAllowlist(['add', ${JSON.stringify(target)}], context);`,
        ].join('\n');
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
          stdio: 'ignore',
        });
        child.on('exit', (exitCode) => {
          resolve(exitCode);
        });
        child.on('error', reject);
      });

    const codes = await Promise.all([addInAnotherProcess(first), addInAnotherProcess(second)]);

    expect(codes).toEqual([0, 0]);
    expect(rootsIn(context.localFile).map((root) => root.path)).toEqual(
      expect.arrayContaining([first, second]),
    );
    expect(fs.existsSync(`${context.localFile}.lock`)).toBe(false);
  });
});

describe('the repository', () => {
  it('ignores the local copy and the pid file: git status stays clean after add — S-56', () => {
    for (const file of ['infra/workspace-allowlist.local.yaml', '.run/backend.pid']) {
      const ignored = run('git', ['check-ignore', '--quiet', '--no-index', file], {
        cwd: repoRoot,
      });

      expect(ignored.code, file).toBe(0);
    }
  });

  it('never ignores the default the repository ships', () => {
    const ignored = run(
      'git',
      ['check-ignore', '--quiet', '--no-index', 'infra/workspace-allowlist.yaml'],
      {
        cwd: repoRoot,
      },
    );

    expect(ignored.code).toBe(1);
  });
});

describe('scripts/allowlist.mjs, as the terminal runs it', () => {
  /** @param {readonly string[]} args */
  const runScript = (args) =>
    run(process.execPath, [path.join(repoRoot, 'scripts', 'allowlist.mjs'), ...args], {
      cwd: repoRoot,
      timeoutMs: 60_000,
      env: { ...process.env, NO_COLOR: '1' },
    });

  it('prints its usage', () => {
    const result = runScript(['--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('pnpm allowlist add <folder>');
  });

  it('refuses a folder that does not exist before touching any file', () => {
    const result = runScript(['add', '/definitely/not/a/folder/of/this/machine']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('does not exist');
  });

  it('lists the allowlist `pnpm dev` would run with', () => {
    const result = runScript(['list']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('active allowlist:');
  });
});

describe('doctor.mjs', () => {
  it('says which workspace allowlist is active — S-61', () => {
    const result = run(process.execPath, [path.join(repoRoot, 'scripts', 'doctor.mjs')], {
      cwd: repoRoot,
      timeoutMs: 120_000,
      env: { ...process.env, NO_COLOR: '1' },
    });

    expect(result.stdout).toMatch(
      /workspace allowlist .*infra\/workspace-allowlist(\.local)?\.yaml/,
    );
  });
});

describe('withFileLock', () => {
  it('takes over a lock left by a crashed run', () => {
    const file = path.join(tempDir(), 'local.yaml');
    fs.writeFileSync(`${file}.lock`, '', 'utf8');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(`${file}.lock`, old, old);

    expect(withFileLock(file, () => 'done')).toBe('done');
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });

  it('gives up on a lock another run is holding, saying so', () => {
    const file = path.join(tempDir(), 'local.yaml');
    fs.writeFileSync(`${file}.lock`, '', 'utf8');

    expect(() => withFileLock(file, () => 'never', { timeoutMs: 60 })).toThrow(
      'held by another run',
    );
    expect(fs.existsSync(`${file}.lock`)).toBe(true);
  });

  it('tries again when the lock is released while it looks at it', () => {
    const file = path.join(tempDir(), 'local.yaml');
    fs.writeFileSync(`${file}.lock`, '', 'utf8');
    let calls = 0;

    const result = withFileLock(file, () => 'done', {
      now: () => {
        calls += 1;
        // The second reading of the clock is the one the staleness check takes: the holder lets go
        // right then, and the look finds no lock at all.
        if (calls === 2) {
          fs.rmSync(`${file}.lock`);
        }
        return Date.now();
      },
    });

    expect(result).toBe('done');
  });

  it('lets a failure that is not "taken" through', () => {
    const file = path.join(tempDir(), 'no-such-directory', 'local.yaml');

    expect(() => withFileLock(file, () => 'never')).toThrow(/ENOENT/);
  });

  it('releases the lock when the work throws', () => {
    const file = path.join(tempDir(), 'local.yaml');

    expect(() =>
      withFileLock(file, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });
});
