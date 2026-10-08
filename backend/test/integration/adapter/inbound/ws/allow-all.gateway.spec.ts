import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * Permitir tudo over the real socket — plan 23, F1.
 *
 * The recorded run asks `canUseTool` about one `Write` per turn. What is proved: the mode reaches
 * the SDK as `default` and still answers in the person's name, switching it on releases a loop
 * already waiting, switching it off asks again at the next tool, and the handler refuses what the
 * contract does not name.
 */
describe('Permitir tudo', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let connection: DatabaseConnection;
  let record: ScriptRecord;
  let root: string;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    connection = openDatabase(database.url);

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'tool-turn' });
    record = scripted.record;

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
      { RC_PERMISSION_TIMEOUT_MS: '5000' },
    );
  });

  afterEach(async () => {
    for (const { socket, sessionId } of started.splice(0)) {
      if (!socket.isOpen) {
        continue;
      }

      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed').catch(() => undefined);
    }
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await connection.pool.end();
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
    const seen: string[] = [];

    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      seen.push(
        `${frame.type}${frame.kind === 'error' ? `(${String(frame.payload?.['code'])})` : ''}`,
      );

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in: ${seen.join(', ')}`);
  }

  /** Every frame up to the barrier a command of its own puts in the stream — see the round trip spec. */
  async function deliveredSoFar(socket: TestSocket): Promise<Envelope[]> {
    socket.send(commandFrame('session.setLocale', { locale: 'en' }));

    const seen: Envelope[] = [];
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();

      if (frame.kind === 'ack' && frame.payload?.['command'] === 'session.setLocale') {
        return seen;
      }

      seen.push(frame);
    }

    throw new Error('the barrier never came back');
  }

  async function startIn(
    socket: TestSocket,
    permissionMode?: string,
  ): Promise<{ sessionId: string; started: Envelope }> {
    socket.send(
      commandFrame('session.start', {
        workspacePath: root,
        ...(permissionMode === undefined ? {} : { permissionMode }),
      }),
    );
    const startedFrame = await until(socket, 'session.started');
    const sessionId = String(startedFrame.payload?.['sessionId']);
    started.push({ socket, sessionId });

    return { sessionId, started: startedFrame };
  }

  async function history(requestId: string) {
    const rows = await connection.db.execute<{
      status: string;
      decision: string | null;
      resolved_by: string | null;
      auto: boolean | null;
      rule_id: string | null;
      scope: string | null;
    }>(
      sql`SELECT "status", "decision", "resolved_by", "auto", "rule_id", "scope"
          FROM "permission_requests" WHERE "id" = ${requestId}`,
    );

    return rows.rows[0] ?? null;
  }

  it('opens in Permitir tudo, tells the SDK `default`, and runs the tool unasked — S-26, S-09, S-17', async () => {
    const socket = await connect();
    const { sessionId, started: startedFrame } = await startIn(socket, 'allowAll');

    expect(startedFrame.payload).toMatchObject({ permissionMode: 'allowAll' });
    expect(record.options?.permissionMode).toBe('default');
    expect(record.options?.allowDangerouslySkipPermissions).toBe(false);

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const resolved = await until(socket, 'permission.resolved');
    expect(resolved.payload).toMatchObject({
      decision: 'allow',
      auto: true,
      resolvedBy: SUBJECT,
      via: 'allowAll',
    });
    await until(socket, 'turn.completed');

    expect(await history(String(resolved.payload?.['requestId']))).toEqual({
      status: 'resolved',
      decision: 'allow',
      resolved_by: SUBJECT,
      auto: true,
      rule_id: null,
      scope: 'once',
    });
  });

  it('answers the card already open when switched on, and asks again when switched off — S-22, S-24, S-07', async () => {
    const socket = await connect();
    const { sessionId } = await startIn(socket);

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    const asked = await until(socket, 'permission.requested');

    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'allowAll' }));
    const resolved = await until(socket, 'permission.resolved');
    expect(resolved.payload).toMatchObject({
      requestId: asked.payload?.['requestId'],
      decision: 'allow',
      via: 'allowAll',
    });
    await until(socket, 'turn.completed');
    expect(record.modes.at(-1)).toBe('default');

    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'default' }));
    socket.send(commandFrame('session.prompt', { sessionId, text: 'do it again' }));

    const again = await until(socket, 'permission.requested');
    expect(again.payload?.['requestId']).not.toBe(asked.payload?.['requestId']);
  });

  it('acks Permitir tudo twice without settling anything twice — S-30', async () => {
    const socket = await connect();
    const { sessionId } = await startIn(socket);

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(socket, 'permission.requested');

    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'allowAll' }));
    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'allowAll' }));
    await until(socket, 'turn.completed');

    // The one resolution came before `turn.completed`; nothing after it settles anything again.
    const afterwards = await deliveredSoFar(socket);
    expect(afterwards.filter((frame) => frame.type === 'permission.resolved')).toEqual([]);
  });

  it('refuses a mode the contract does not name, before touching the session — S-28', async () => {
    const socket = await connect();
    const { sessionId } = await startIn(socket);

    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'yolo' }));

    const refused = await until(socket, 'error');
    expect(refused.payload).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses a session that does not exist — S-29', async () => {
    const socket = await connect();

    socket.send(
      commandFrame('session.setPermissionMode', {
        sessionId: '01J0ABCDEFGHJKMNPQRSTVWXY9',
        mode: 'allowAll',
      }),
    );

    const refused = await until(socket, 'error');
    expect(refused.payload).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});
