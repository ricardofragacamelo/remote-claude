import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { kill } from '../../../scripts/lib/proc.mjs';
import {
  TUNNEL_TOKEN_VARIABLE,
  TunnelError,
  readTunnelToken,
  startTunnel,
  tunnelEnvironment,
} from '../../../scripts/lib/tunnel.mjs';

/**
 * `startTunnel` against a real process (plan 20, B-02).
 *
 * The real tunnel needs an account and the internet, so the process here is a stand-in that
 * speaks its log format — the lines are the ones a real run printed. What is under test is the
 * part that only shows with a process: the pipe drained, an exit noticed after its last line, a
 * silence that ends at the deadline, a missing executable.
 */

/** @type {string} */
let dir;
/** @type {string} */
let fake;

/** @type {import('node:child_process').ChildProcess[]} */
const started = [];

const FAKE = `#!/usr/bin/env node
const host = process.argv.find((arg) => arg.startsWith('--url='))?.slice('--url='.length);
const mode = process.env.FAKE_TUNNEL_MODE;
if (process.env.FAKE_TUNNEL_PIDFILE) require('node:fs').writeFileSync(process.env.FAKE_TUNNEL_PIDFILE, String(process.pid));
const log = (entry) => process.stdout.write(JSON.stringify({ t: 'now', ...entry }) + '\\n');

log({ lvl: 'info', msg: 'no configuration paths supplied' });
process.stderr.write('not json, on the other pipe\\n');

if (process.env.FAKE_TUNNEL_TOKENFILE) require('node:fs').writeFileSync(process.env.FAKE_TUNNEL_TOKENFILE, process.env.NGROK_AUTHTOKEN ?? '<none>');

if (mode === 'start') {
  log({ lvl: 'info', msg: 'started tunnel', url: 'https://' + (host ?? 'account.ngrok-free.dev') });
  setTimeout(() => log({ lvl: 'eror', msg: 'session closing', err: 'session closed\\nretrying' }), 50);
  setInterval(() => {}, 1000);
} else if (mode === 'refuse') {
  log({ lvl: 'crit', msg: 'command failed', err: 'failed to start tunnel: endpoint is already online\\r\\nERR_NGROK_334\\r\\n' });
  process.exit(1);
} else {
  setInterval(() => {}, 1000);
}
`;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-tunnel-'));
  fake = path.join(dir, 'fake-tunnel');
  fs.writeFileSync(fake, FAKE, { mode: 0o755 });
});

afterEach(async () => {
  for (const proc of started.splice(0)) {
    await kill(proc);
  }
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** @param {string} mode */
const env = (mode) => ({ ...process.env, FAKE_TUNNEL_MODE: mode });

describe('startTunnel, against a process', () => {
  it('resolves with the endpoint and leaves the tunnel running (S-16)', async () => {
    /** @type {string[]} */
    const later = [];
    const tunnel = await startTunnel({
      port: 5173,
      host: 'name.ngrok-free.dev',
      command: fake,
      env: env('start'),
      onError: (message) => later.push(message),
    });
    started.push(tunnel.proc);

    expect(tunnel.url).toBe('https://name.ngrok-free.dev');
    expect(tunnel.proc.exitCode).toBeNull();

    // An error after the start is handed on, not swallowed: the pipe is still being read.
    await expect.poll(() => later).toEqual(['session closed']);
  });

  it('asks for no host when there is none, and takes the account domain', async () => {
    const tunnel = await startTunnel({ port: 5173, host: null, command: fake, env: env('start') });
    started.push(tunnel.proc);

    expect(tunnel.url).toBe('https://account.ngrok-free.dev');
  });

  it('fails with the error the tunnel printed on its way out (S-14, S-35)', async () => {
    const run = startTunnel({ port: 5173, host: null, command: fake, env: env('refuse') });

    await expect(run).rejects.toThrow(TunnelError);
    await expect(run).rejects.toThrow(
      'tunnel exited with code 1: failed to start tunnel: endpoint is already online (ERR_NGROK_334)',
    );
  });

  it('gives up at the deadline when the tunnel says nothing (S-15)', async () => {
    const run = startTunnel({
      port: 5173,
      host: null,
      command: fake,
      env: env('silent'),
      timeoutMs: 300,
    });

    await expect(run).rejects.toThrow('the tunnel reported no endpoint within 300ms');
  });

  it('says the tunnel stopped, and that it gave no reason, when a signal ends it first', async () => {
    const pidFile = path.join(dir, 'pid');
    const run = startTunnel({
      port: 5173,
      host: null,
      command: fake,
      env: { ...env('silent'), FAKE_TUNNEL_PIDFILE: pidFile },
    });

    // The process is not handed out before it starts, so the signal goes by its pid, from outside.
    await expect.poll(() => fs.existsSync(pidFile)).toBe(true);
    process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGTERM');

    await expect(run).rejects.toThrow('tunnel exited with SIGTERM: no error reported');
  });

  it('passes on why the executable could not start, when it is there but cannot run', async () => {
    const locked = path.join(dir, 'locked-tunnel');
    fs.writeFileSync(locked, FAKE, { mode: 0o644 });

    await expect(startTunnel({ port: 5173, host: null, command: locked })).rejects.toThrow(
      /EACCES/,
    );
  });

  it('keeps reading after the start even with nobody to tell about an error', async () => {
    const tunnel = await startTunnel({ port: 5173, host: null, command: fake, env: env('start') });
    started.push(tunnel.proc);

    // The fake reports an error 50 ms after the start; the tunnel has to outlive it.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(tunnel.proc.exitCode).toBeNull();
  });

  it('says the tunnel is not installed when the executable does not exist (S-17)', async () => {
    const missing = path.join(dir, 'no-such-tunnel');

    await expect(startTunnel({ port: 5173, host: null, command: missing })).rejects.toThrow(
      `tunnel not found: \`${missing}\` is not on PATH`,
    );
  });
});

describe('the kept authtoken', () => {
  /** @param {string} content @param {number} mode */
  const keep = (content, mode) => {
    const file = path.join(dir, `token-${String(mode)}-${String(content.length)}`);
    fs.writeFileSync(file, content, { mode });
    fs.chmodSync(file, mode);
    return file;
  };

  it('reads the token without its newline, from a file only its owner reads', () => {
    expect(readTunnelToken(keep('kept-token\n', 0o600))).toEqual({
      token: 'kept-token',
      exposed: false,
    });
  });

  it('reads no token from a missing file, or a blank one (S-38)', () => {
    expect(readTunnelToken(path.join(dir, 'no-such-token'))).toEqual({
      token: null,
      exposed: false,
    });
    expect(readTunnelToken(keep(' \n', 0o600))).toEqual({ token: null, exposed: false });
  });

  it('says when the file is readable by group or others (S-40)', () => {
    expect(readTunnelToken(keep('kept-token', 0o644))).toEqual({
      token: 'kept-token',
      exposed: true,
    });
  });

  it('reaches the tunnel process, and only it (S-37, S-41)', async () => {
    const seen = path.join(dir, 'seen-token');
    const tunnelEnv = tunnelEnvironment(
      { ...env('start'), FAKE_TUNNEL_TOKENFILE: seen, [TUNNEL_TOKEN_VARIABLE]: '' },
      'kept-token',
    );
    const tunnel = await startTunnel({ port: 5173, host: null, command: fake, env: tunnelEnv.env });
    started.push(tunnel.proc);

    expect(fs.readFileSync(seen, 'utf8')).toBe('kept-token');
    expect(process.env[TUNNEL_TOKEN_VARIABLE]).not.toBe('kept-token');
  });
});
