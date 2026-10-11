import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
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
 * Read-only over the real socket — plan 28, B-26 / S-78.
 *
 * `tool-turn` asks `canUseTool` about one `Write`, `edit-turn` about two `Edit`s and two `Write`s,
 * and `init-turn` about a `Bash` and a `Write`; the `Read`s of the recordings never reach it. What is
 * proved: the mode reaches the SDK as `plan`, our gate refuses every write and every shell by itself
 * — with `via: 'readOnly'`, recorded, and even when a rule allows it —, switching to it refuses the
 * card already open, and what changes nothing still runs.
 */
describe('a read-only session', () => {
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
    await connection.db.execute(sql`DELETE FROM "permission_rules"`);

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

  /** Every frame of [type] up to the end of the turn. */
  async function allUntilTurnEnds(socket: TestSocket, type: string): Promise<Envelope[]> {
    const seen: Envelope[] = [];

    for (let taken = 0; taken < 400; taken += 1) {
      const frame = await socket.next();

      if (frame.type === 'turn.completed') {
        return seen;
      }
      if (frame.type === type) {
        seen.push(frame);
      }
    }

    throw new Error('the turn never ended');
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
      auto: boolean | null;
      rule_id: string | null;
    }>(
      sql`SELECT "status", "decision", "auto", "rule_id"
          FROM "permission_requests" WHERE "id" = ${requestId}`,
    );

    return rows.rows[0] ?? null;
  }

  /** An `allow` of [pattern] for every project, stored as a person granted it earlier. */
  async function allowAlways(pattern: string): Promise<void> {
    await connection.db.execute(
      sql`INSERT INTO "permission_rules"
            ("id", "user_id", "scope", "project_path", "pattern", "decision", "granted_at",
             "expires_at", "grammar")
          VALUES (${`rule-${pattern}-${String(Date.now())}`}, ${SUBJECT}, 'always', NULL,
                  ${pattern}, 'allow', now(), now() + interval '1 day', 'canonical')`,
    );
  }

  /** What the SDK was told of the last invocation `canUseTool` was asked about. */
  function lastVerdict(): unknown {
    return record.verdicts.at(-1)?.result;
  }

  it('opens in read-only, tells the SDK `plan`, and refuses the write by itself — S-78', async () => {
    const socket = await connect();
    const { sessionId, started: startedFrame } = await startIn(socket, 'readOnly');

    expect(startedFrame.payload).toMatchObject({ permissionMode: 'readOnly' });
    expect(record.options?.permissionMode).toBe('plan');

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const resolved = await until(socket, 'permission.resolved');
    expect(resolved.payload).toMatchObject({
      decision: 'deny',
      auto: true,
      resolvedBy: SUBJECT,
      via: 'readOnly',
    });
    expect(lastVerdict()).toMatchObject({
      behavior: 'deny',
      message: expect.stringContaining('read-only'),
    });
    await until(socket, 'turn.completed');

    expect(await history(String(resolved.payload?.['requestId']))).toEqual({
      status: 'resolved',
      decision: 'deny',
      auto: true,
      rule_id: null,
    });
  });

  it('refuses the write even with an allow rule standing for it', async () => {
    await allowAlways('file.write');
    const socket = await connect();
    const { sessionId } = await startIn(socket, 'readOnly');

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    expect((await until(socket, 'permission.resolved')).payload).toMatchObject({
      decision: 'deny',
      via: 'readOnly',
    });
  });

  it('refuses every edit and every write of a turn, and never puts one to the person', async () => {
    const socket = await connect();
    const { sessionId } = await startIn(socket, 'readOnly');

    socket.send(commandFrame('session.prompt', { sessionId, text: '[fixture:edit-turn] edit it' }));
    const refusals = await allUntilTurnEnds(socket, 'permission.resolved');

    expect(refusals).toHaveLength(4);
    for (const refusal of refusals) {
      expect(refusal.payload).toMatchObject({ decision: 'deny', auto: true, via: 'readOnly' });
    }
  });

  it('refuses a shell, and lets the reads of the turn run — no card, nothing asked', async () => {
    const socket = await connect();
    const { sessionId } = await startIn(socket, 'readOnly');

    socket.send(commandFrame('session.prompt', { sessionId, text: '[fixture:init-turn] look' }));
    const seen: Envelope[] = [];
    for (let taken = 0; taken < 400; taken += 1) {
      const frame = await socket.next();
      seen.push(frame);
      if (frame.type === 'turn.completed') {
        break;
      }
    }

    expect(seen.map((frame) => frame.type)).not.toContain('permission.requested');
    const refused = seen.filter((frame) => frame.type === 'permission.resolved');
    expect(refused.map((frame) => frame.payload?.['via'])).toEqual(['readOnly', 'readOnly']);
    const reads = seen.filter(
      (frame) => frame.type === 'tool.started' && frame.payload?.['kind'] === 'file.read',
    );
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      const toolUseId = read.payload?.['toolUseId'];
      expect(
        seen.some(
          (frame) => frame.type === 'tool.completed' && frame.payload?.['toolUseId'] === toolUseId,
        ),
      ).toBe(true);
    }
  });

  it('refuses the card already open when the session switches to read-only', async () => {
    const socket = await connect();
    const { sessionId } = await startIn(socket, 'ask');

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    const asked = await until(socket, 'permission.requested');

    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'readOnly' }));
    const resolved = await until(socket, 'permission.resolved');

    expect(resolved.payload).toMatchObject({
      requestId: asked.payload?.['requestId'],
      decision: 'deny',
      auto: true,
      via: 'readOnly',
    });
    await until(socket, 'turn.completed');
    expect(record.modes.at(-1)).toBe('plan');
  });

  it('asks again when the session leaves read-only', async () => {
    const socket = await connect();
    const { sessionId } = await startIn(socket, 'readOnly');

    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'ask' }));
    await until(socket, 'command.accepted');
    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    expect((await until(socket, 'permission.requested')).payload).toMatchObject({
      kind: 'file.write',
    });
    expect(record.modes.at(-1)).toBe('default');
  });
});
