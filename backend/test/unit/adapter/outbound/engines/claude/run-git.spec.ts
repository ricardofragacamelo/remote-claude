import { afterEach, describe, expect, it, vi } from 'vitest';

import { runGit } from '@adapter/outbound/engines/claude/git-marketplace-plugin-source';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

// `vi.hoisted` so this exists by the time `vi.mock` below — itself hoisted above every import of
// this file — runs; a plain top-level `const` would still throw "before initialization".
const execFileMock = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args: readonly string[],
      options: Record<string, unknown>,
      callback: ExecFileCallback,
    ) => void
  >(),
);

// Hoisted by Vitest above this file's own imports, so `git-marketplace-plugin-source.ts`'s
// `import { execFile } from 'node:child_process'` resolves to this mock, never the real subprocess.
vi.mock('node:child_process', () => ({ execFile: execFileMock }));

describe('runGit — plan 13, B-47, S-211', () => {
  const SAVED_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...SAVED_ENV };
    execFileMock.mockReset();
  });

  it('runs git, never claude, over an environment without the backend’s own configuration', async () => {
    process.env['DATABASE_URL'] = 'postgres://should-not-leak/db';
    process.env['OIDC_ISSUER'] = 'https://should-not-leak.invalid';
    process.env['RC_PUSH_CREDENTIALS_FILE'] = '/should/not/leak';
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, 'ok', '');
    });

    await runGit(['ls-remote', 'https://example.invalid/acme.git', 'HEAD'], { timeoutMs: 1000 });

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = execFileMock.mock.calls[0]!;
    expect(command).toBe('git');
    expect(command).not.toBe('claude');
    expect(args).toEqual(['ls-remote', 'https://example.invalid/acme.git', 'HEAD']);

    const env = options['env'] as Record<string, string | undefined>;
    expect(env['DATABASE_URL']).toBeUndefined();
    expect(env['OIDC_ISSUER']).toBeUndefined();
    expect(env['RC_PUSH_CREDENTIALS_FILE']).toBeUndefined();
    expect(env['PATH']).toBe(process.env['PATH']);
    expect(env['GIT_TERMINAL_PROMPT']).toBe('0');
  });

  it('passes the given cwd and timeout through to the subprocess', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, '', '');
    });

    await runGit(['rev-parse', 'HEAD'], { cwd: '/srv/clone', timeoutMs: 42 });

    const [, , options] = execFileMock.mock.calls[0]!;
    expect(options['cwd']).toBe('/srv/clone');
    expect(options['timeout']).toBe(42);
  });

  it('rejects when the subprocess errors', async () => {
    const failure = new Error('git exited with code 128');
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(failure, '', 'fatal: repository not found');
    });

    await expect(runGit(['clone', 'bad-url', '/tmp/x'], { timeoutMs: 1000 })).rejects.toThrow(
      'git exited with code 128',
    );
  });
});
