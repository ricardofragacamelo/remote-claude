import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { OWNER_VALUE, PROCESS_MARKER } from '@adapter/outbound/claude/process-marker';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/** Values nobody would type, so finding one anywhere in the subprocess's env is unambiguous. */
const SENTINEL = 'sentinel-that-must-not-reach-claude';

/**
 * What the Claude subprocess inherits, through the real gateway — plan 12, B-13.
 *
 * `pnpm dev` loads the whole `.env` into the backend's process. Here that is reproduced by putting
 * the same kind of variables in this process's environment — a connection string, the compose
 * passwords, the identity provider — and opening a session the way a browser does. The scripted SDK
 * records the options the backend handed it, which is exactly what the CLI would have been started
 * with.
 */
describe('the environment of the Claude subprocess, over the gateway', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    const scripted = scriptedSdk({ fixture: 'text-turn' });
    record = scripted.record;

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();

    for (const socket of open.splice(0)) {
      socket.close();
    }
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  async function connect(): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);

    socket.send(
      commandFrame('connection.authenticate', {
        token: await identity.accessToken({ subject: SUBJECT }),
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await socket.next();

    return socket;
  }

  async function until(socket: TestSocket, type: string, limit = 400): Promise<Envelope> {
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type}`);
  }

  it('starts Claude without the backend configuration, even when the process carries it — S-108', async () => {
    vi.stubEnv('DATABASE_URL', `postgres://user:${SENTINEL}@localhost/db`);
    vi.stubEnv('RC_POSTGRES_PASSWORD', SENTINEL);
    vi.stubEnv('RC_KEYCLOAK_ADMIN_PASSWORD', SENTINEL);
    vi.stubEnv('OIDC_ISSUER', `http://localhost/${SENTINEL}`);
    vi.stubEnv('PGPASSWORD', SENTINEL);

    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const started = await until(socket, 'session.started');

    const env = record.options?.env ?? {};
    expect(Object.keys(env).filter((name) => /^(RC_|OIDC_|DATABASE_|PG)/.test(name))).toEqual([]);
    expect(Object.values(env).some((value) => value?.includes(SENTINEL))).toBe(false);

    socket.send(
      commandFrame('session.close', { sessionId: String(started.payload?.['sessionId']) }),
    );
    await until(socket, 'session.closed');
  });

  it('keeps the machine and the login, and marks the subprocess as ours — S-109', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.internal:3128');
    vi.stubEnv('CLAUDE_CONFIG_DIR', process.env['CLAUDE_CONFIG_DIR'] ?? '/home/me/.claude');

    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const started = await until(socket, 'session.started');

    const env = record.options?.env ?? {};
    expect(env['HTTPS_PROXY']).toBe('http://proxy.internal:3128');
    expect(env['CLAUDE_CONFIG_DIR']).toBe(process.env['CLAUDE_CONFIG_DIR']);
    expect(env['PATH']).toBe(process.env['PATH']);
    expect(env[PROCESS_MARKER.owner]).toBe(OWNER_VALUE);

    socket.send(
      commandFrame('session.close', { sessionId: String(started.payload?.['sessionId']) }),
    );
    await until(socket, 'session.closed');
  });
});
