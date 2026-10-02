import { describe, expect, it } from 'vitest';

import {
  TUNNEL_TOKEN_VARIABLE,
  parseTunnelLine,
  tunnelArgs,
  tunnelEnvironment,
  tunnelMismatch,
} from '../../../scripts/lib/tunnel.mjs';

/**
 * What `pnpm dev:public` asks of the tunnel, and what it reads back from its log (plan 20, B-02).
 *
 * The lines are the tunnel's own, captured from a real run (3.39) — the start, and the refusal of
 * a domain the account does not own.
 */

const STARTED =
  '{"t":"2026-10-02T08:15:41-0300","lvl":"info","msg":"started tunnel","obj":"tunnels",' +
  '"name":"command_line","addr":{"Scheme":"http","Host":"localhost:5173"},' +
  '"url":"https://name.ngrok-free.dev"}';

const REFUSED =
  '{"t":"2026-10-02T08:15:48-0300","lvl":"crit","msg":"command failed","err":"failed to start ' +
  'tunnel: Only paid plans may create endpoints with custom subdomains.\\nThis account is on the ' +
  "'Free' plan.\\r\\n\\r\\nERR_NGROK_313\\r\\n\"}";

describe('tunnelArgs', () => {
  it('asks for the host when there is one, and for the account domain otherwise (S-10)', () => {
    expect(tunnelArgs(5173, 'name.ngrok-free.dev')).toEqual([
      'http',
      '--url=name.ngrok-free.dev',
      '5173',
      '--log=stdout',
      '--log-format=json',
    ]);
    expect(tunnelArgs(5173, null)).toEqual(['http', '5173', '--log=stdout', '--log-format=json']);
  });
});

describe('parseTunnelLine', () => {
  it('reads the endpoint from the start line (S-11)', () => {
    expect(parseTunnelLine(STARTED)).toEqual({
      kind: 'started',
      url: 'https://name.ngrok-free.dev',
    });
  });

  it('reads the first line of an error, with its code (S-12)', () => {
    expect(parseTunnelLine(REFUSED)).toEqual({
      kind: 'error',
      message:
        'failed to start tunnel: Only paid plans may create endpoints with custom subdomains. ' +
        '(ERR_NGROK_313)',
    });
  });

  it('does not repeat a code the first line already carries', () => {
    const line = JSON.stringify({ lvl: 'eror', err: 'ERR_NGROK_334: endpoint is already online' });
    expect(parseTunnelLine(line)).toEqual({
      kind: 'error',
      message: 'ERR_NGROK_334: endpoint is already online',
    });
  });

  it('reads an error without a code as its first line', () => {
    expect(
      parseTunnelLine(JSON.stringify({ lvl: 'eror', err: 'session closed\nretrying' })),
    ).toEqual({
      kind: 'error',
      message: 'session closed',
    });
  });

  it.each([
    'ERROR:  failed to start tunnel',
    '',
    'null',
    '42',
    JSON.stringify({ lvl: 'info', msg: 'client session established' }),
    JSON.stringify({ msg: 'started tunnel' }),
    JSON.stringify({ lvl: 'eror', msg: 'no err field' }),
    JSON.stringify({ lvl: 'warn', err: 'a warning is not a failure' }),
  ])('ignores %j (S-13)', (line) => {
    expect(parseTunnelLine(line)).toBeNull();
  });
});

describe('tunnelMismatch', () => {
  it('accepts any endpoint when no host was asked for', () => {
    expect(tunnelMismatch('https://other.ngrok-free.dev', null)).toBeNull();
  });

  it('accepts the host that was asked for', () => {
    expect(tunnelMismatch('https://name.ngrok-free.dev', 'name.ngrok-free.dev')).toBeNull();
  });

  it('refuses an endpoint on another host (S-18)', () => {
    expect(tunnelMismatch('https://other.ngrok-free.dev', 'name.ngrok-free.dev')).toBe(
      'the tunnel opened other.ngrok-free.dev, not name.ngrok-free.dev',
    );
  });
});

describe('tunnelEnvironment', () => {
  const base = { PATH: '/usr/bin', RC_WEB_PORT: '5173' };

  it('hands the kept token to the tunnel, and says it came from the file (S-37)', () => {
    expect(tunnelEnvironment(base, 'kept-token')).toEqual({
      env: { ...base, [TUNNEL_TOKEN_VARIABLE]: 'kept-token' },
      source: 'file',
    });
  });

  it('lets an exported token win over the file (S-39)', () => {
    const exported = { ...base, [TUNNEL_TOKEN_VARIABLE]: 'exported-token' };

    expect(tunnelEnvironment(exported, 'kept-token')).toEqual({
      env: exported,
      source: 'environment',
    });
  });

  it('treats a blank export as no export', () => {
    expect(tunnelEnvironment({ ...base, [TUNNEL_TOKEN_VARIABLE]: ' ' }, 'kept-token').source).toBe(
      'file',
    );
  });

  it('leaves the tunnel to its own config with neither', () => {
    expect(tunnelEnvironment(base, null)).toEqual({ env: base, source: 'tunnel config' });
  });

  it('never writes the token into the environment it was given (S-41)', () => {
    const env = { ...base };
    const built = tunnelEnvironment(env, 'kept-token');

    expect(env).toEqual(base);
    expect(built.env).not.toBe(env);
  });
});
