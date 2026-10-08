import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import {
  EndSessionPermissionsUseCase,
  RequestPermissionUseCase,
  ResolvePermissionUseCase,
} from '@application/permission';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * The reach of a rule left by an answer, over the real socket and the real tables — plan 23, F2.
 *
 * The recorded run asks about one `Write` per turn: a tool with an exact reach and a whole-tool
 * reach, and no prefix. The shell cases go through the use cases against the same database, which
 * is where several patterns become several rows.
 */
describe('the reach of an answer', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let connection: DatabaseConnection;
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
    await connection.db.execute(sql`DELETE FROM "permission_rules"`);
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

  async function asked(socket: TestSocket): Promise<{ sessionId: string; request: Envelope }> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    return { sessionId, request: await until(socket, 'permission.requested') };
  }

  async function rules(): Promise<{ pattern: string; scope: string; decision: string }[]> {
    const rows = await connection.db.execute<{ pattern: string; scope: string; decision: string }>(
      sql`SELECT "pattern", "scope", "decision" FROM "permission_rules"
          WHERE "revoked_at" IS NULL ORDER BY "granted_at", "pattern"`,
    );

    return rows.rows;
  }

  it('asks with every reach the invocation has, and the persisted scopes — S-55', async () => {
    const { request } = await asked(await connect());

    const reaches = request.payload?.['reaches'] as { reach: string; patterns: string[] }[];
    expect(reaches.map((reach) => reach.reach)).toEqual(['exact', 'tool']);
    expect(reaches[1]?.patterns).toEqual(['Write']);
    expect(
      (request.payload?.['suggestions'] as { scope: string }[]).map(
        (suggestion) => suggestion.scope,
      ),
    ).toEqual(['once', 'session', 'project', 'always']);
  });

  it('remembers the whole tool for the session, and the next turn is not asked — S-58', async () => {
    const socket = await connect();
    const { sessionId, request } = await asked(socket);

    socket.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
        scope: 'session',
        reach: 'tool',
      }),
    );
    await until(socket, 'turn.completed');

    socket.send(commandFrame('session.prompt', { sessionId, text: 'again' }));
    const resolved = await until(socket, 'permission.resolved');
    expect(resolved.payload).toMatchObject({ auto: true, via: 'rule', decision: 'allow' });
  });

  it('refuses a reach the request was not offered, and keeps asking — S-59', async () => {
    const socket = await connect();
    const { request } = await asked(socket);

    socket.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
        scope: 'always',
        reach: 'prefix',
      }),
    );

    const refused = await until(socket, 'error');
    expect(refused.payload).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await rules()).toEqual([]);

    // Still open: the person can answer again.
    socket.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
      }),
    );
    await until(socket, 'turn.completed');
  });

  it('refuses a reach the contract does not name — S-60', async () => {
    const socket = await connect();
    const { request } = await asked(socket);

    socket.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
        scope: 'session',
        reach: 'glob',
      }),
    );

    const refused = await until(socket, 'error');
    expect(refused.payload).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('reads no reach as exact — S-61', async () => {
    const socket = await connect();
    const { request } = await asked(socket);

    socket.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
        scope: 'always',
      }),
    );
    await until(socket, 'turn.completed');

    expect((await rules()).map((rule) => rule.pattern)).toEqual([
      expect.stringMatching(/^Write\(.+\)$/),
    ]);
  });

  it('lets the first of two answers with different reaches win, and only its rule exist — S-65', async () => {
    const first = await connect();
    const second = await connect();
    const { sessionId, request } = await asked(first);
    second.send(commandFrame('session.attach', { sessionId }));
    await until(second, 'session.attached');

    const requestId = request.payload?.['requestId'];
    first.send(
      commandFrame('permission.resolve', {
        requestId,
        decision: 'allow',
        scope: 'always',
        reach: 'tool',
      }),
    );
    second.send(
      commandFrame('permission.resolve', {
        requestId,
        decision: 'allow',
        scope: 'always',
        reach: 'exact',
      }),
    );
    await until(first, 'turn.completed');
    await until(second, 'turn.completed');

    expect(await rules()).toEqual([{ pattern: 'Write', scope: 'always', decision: 'allow' }]);
  });

  describe('a shell line, through the use cases', () => {
    const session = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY5');
    const owner = UserId.create(SUBJECT);

    afterEach(async () => {
      await harness.app.get(EndSessionPermissionsUseCase).execute(session);
    });

    const ask = (requestId: string, command: string) =>
      harness.app.get(RequestPermissionUseCase).execute({
        requestId,
        sessionId: session,
        userId: owner,
        projectPath: root,
        permissionMode: 'default',
        toolUseId: `toolu-${requestId}`,
        toolName: 'Bash',
        input: { command },
      });

    const answer = (requestId: string) =>
      harness.app.get(ResolvePermissionUseCase).execute({
        requestId,
        decision: 'allow',
        reason: null,
        scope: 'project',
        reach: 'prefix',
        userId: owner,
        resolvedFrom: 'web',
        watchesSession: () => true,
      });

    it('stores a rule per command, and the next line of those commands answers itself — S-57', async () => {
      await ask('reach-1', 'git push 2>&1 | tail -5');
      await answer('reach-1');

      expect(await rules()).toEqual([
        { pattern: 'Bash(git push:*)', scope: 'project', decision: 'allow' },
        { pattern: 'Bash(tail:*)', scope: 'project', decision: 'allow' },
      ]);

      const next = await ask('reach-2', 'git push origin main 2>&1 | tail -20');
      expect(next.kind).toBe('settled');
    });

    it('stores nothing twice when the same answer comes again — S-64', async () => {
      await ask('reach-3', 'git push | tail -5');
      await answer('reach-3');
      await ask('reach-4', 'git push | tail -5 && echo done');
      await answer('reach-4');

      expect((await rules()).map((rule) => rule.pattern)).toEqual([
        'Bash(git push:*)',
        'Bash(tail:*)',
        'Bash(echo done:*)',
      ]);
    });
  });
});
