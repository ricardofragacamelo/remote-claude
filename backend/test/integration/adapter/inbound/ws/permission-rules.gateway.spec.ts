import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

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

/** The second account, allowed in the same workspace, whose rules must never be the first one's. */
const OTHER = 'auth|other';

/** The one invocation the recorded run asks about, and the narrowest rule that covers it. */
const RECORDED_PATTERN = 'Write(/workspace/summary.md)';

/**
 * Rules that outlive a session, over a real socket and a real database — plan 03, F0.
 *
 * The Agent SDK replays a recorded run whose one sensitive tool is a `Write`, so every session of
 * this suite asks the same question. What is proved is what a person would notice: a rule granted
 * in one session answers the next one without a card; a revoked one stops answering in a session
 * that is already running; and nobody's rule answers anybody else.
 */
describe('permission rules over the socket', () => {
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

    const allowlist = writeTestAllowlist([SUBJECT, OTHER]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'tool-turn' });

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
      // Long enough that nothing in this suite ever reaches the deadline by accident: every
      // question here is either answered by a person or by a rule.
      { RC_PERMISSION_TIMEOUT_MS: '30000' },
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

    // Rules are the point of every scenario, and one left behind would answer the next scenario's
    // question for it. The table has no trigger: a rule is revocable, the trail is what is not.
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

  const http = (): request.Agent => request(harness.app.getHttpServer());

  async function bearer(subject: string): Promise<string> {
    return identity.accessToken({ subject });
  }

  async function connect(subject: string = SUBJECT): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);

    socket.send(
      commandFrame('connection.authenticate', {
        token: await bearer(subject),
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
      seen.push(frame.type);

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in: ${seen.join(', ')}`);
  }

  async function startSession(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();

    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    return sessionId;
  }

  /**
   * Prompts, and reads until the turn either finishes or stops on a person.
   *
   * Whichever comes first is the whole question: a turn that completes without a
   * `permission.requested` is a turn a rule answered.
   */
  async function turn(socket: TestSocket, sessionId: string): Promise<Envelope[]> {
    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

    const frames: Envelope[] = [];
    for (let taken = 0; taken < 400; taken += 1) {
      const frame = await socket.next();
      frames.push(frame);

      if (frame.type === 'turn.completed' || frame.type === 'permission.requested') {
        return frames;
      }
    }

    throw new Error(`the turn neither finished nor asked: ${frames.map((f) => f.type).join(', ')}`);
  }

  const types = (frames: readonly Envelope[]): string[] => frames.map((frame) => frame.type);

  const resolvedIn = (frames: readonly Envelope[]): Envelope | undefined =>
    frames.find((frame) => frame.type === 'permission.resolved');

  /** Answers the question a turn stopped on, with a scope. */
  async function answer(socket: TestSocket, frames: readonly Envelope[], scope: string) {
    const asked = frames.at(-1);
    expect(asked?.type).toBe('permission.requested');

    socket.send(
      commandFrame('permission.resolve', {
        requestId: asked?.payload?.['requestId'],
        decision: 'allow',
        scope,
      }),
    );
    await until(socket, 'turn.completed');
  }

  async function grant(body: Record<string, unknown>, subject: string = SUBJECT) {
    return http()
      .post('/permission-rules')
      .set('authorization', `Bearer ${await bearer(subject)}`)
      .send(body);
  }

  async function history(requestId: string) {
    const rows = await connection.db.execute<{ auto: boolean | null; rule_id: string | null }>(
      sql`SELECT "auto", "rule_id" FROM "permission_requests" WHERE "id" = ${requestId}`,
    );

    return rows.rows[0] ?? null;
  }

  it('answers every later session of the project, with no card — S-01, S-04, S-62', async () => {
    const socket = await connect();

    const first = await startSession(socket);
    await answer(socket, await turn(socket, first), 'project');

    const rules = await http()
      .get('/permission-rules')
      .set('authorization', `Bearer ${await bearer(SUBJECT)}`);
    expect(rules.body.rules).toEqual([
      expect.objectContaining({ scope: 'project', pattern: RECORDED_PATTERN, projectPath: root }),
    ]);

    const second = await startSession(socket);
    const frames = await turn(socket, second);

    // Nothing asked, and the turn finished — yet every screen is told a rule acted.
    expect(types(frames)).not.toContain('permission.requested');
    expect(types(frames)).toContain('turn.completed');
    const resolved = resolvedIn(frames);
    expect(resolved?.payload).toMatchObject({ decision: 'allow', auto: true, resolvedBy: SUBJECT });

    // The history says **which** rule let it run.
    expect(await history(String(resolved?.payload?.['requestId']))).toEqual({
      auto: true,
      rule_id: rules.body.rules[0].id,
    });
  });

  it('answers from a rule granted through the API, `always` — S-02', async () => {
    expect(
      (await grant({ pattern: RECORDED_PATTERN, decision: 'allow', scope: 'always' })).status,
    ).toBe(201);

    const socket = await connect();
    const frames = await turn(socket, await startSession(socket));

    expect(types(frames)).not.toContain('permission.requested');
    expect(resolvedIn(frames)?.payload).toMatchObject({ auto: true });
  });

  it('refuses by rule, and the turn goes on without anybody asked — S-07', async () => {
    await grant({ pattern: 'Write', decision: 'allow', scope: 'always' });
    await grant({
      pattern: RECORDED_PATTERN,
      decision: 'deny',
      scope: 'project',
      projectPath: root,
    });

    const socket = await connect();
    const frames = await turn(socket, await startSession(socket));

    expect(types(frames)).not.toContain('permission.requested');
    expect(resolvedIn(frames)?.payload).toMatchObject({ decision: 'deny', auto: true });
  });

  it('forgets a session rule when its session ends — S-03', async () => {
    const socket = await connect();

    const first = await startSession(socket);
    await answer(socket, await turn(socket, first), 'session');
    socket.send(commandFrame('session.close', { sessionId: first }));
    await until(socket, 'session.closed');
    // Closed here, so the teardown must not wait for a second `session.closed` that never comes.
    started.splice(
      started.findIndex((entry) => entry.sessionId === first),
      1,
    );

    const second = await startSession(socket);
    expect(types(await turn(socket, second))).toContain('permission.requested');
  });

  it('asks again in a session already running, once the rule is revoked — S-09', async () => {
    const granted = await grant({
      pattern: RECORDED_PATTERN,
      decision: 'allow',
      scope: 'project',
      projectPath: root,
    });

    const socket = await connect();
    const sessionId = await startSession(socket);
    expect(types(await turn(socket, sessionId))).not.toContain('permission.requested');

    const revoked = await http()
      .delete(`/permission-rules/${String(granted.body.id)}`)
      .set('authorization', `Bearer ${await bearer(SUBJECT)}`);
    expect(revoked.status).toBe(200);

    // The same session, never restarted: a revocation that waited for a restart would not be one.
    expect(types(await turn(socket, sessionId))).toContain('permission.requested');
  });

  it('answers two sessions that ask at the same moment — S-11', async () => {
    await grant({ pattern: RECORDED_PATTERN, decision: 'allow', scope: 'always' });

    const one = await connect();
    const two = await connect();
    const [first, second] = await Promise.all([startSession(one), startSession(two)]);

    const [a, b] = await Promise.all([turn(one, first), turn(two, second)]);

    for (const frames of [a, b]) {
      expect(types(frames)).not.toContain('permission.requested');
      expect(types(frames)).toContain('turn.completed');
    }
  });

  it('never answers another person, who is still asked — S-14', async () => {
    await grant({ pattern: RECORDED_PATTERN, decision: 'allow', scope: 'always' });

    const socket = await connect(OTHER);
    const frames = await turn(socket, await startSession(socket));

    expect(types(frames)).toContain('permission.requested');
    expect(resolvedIn(frames)).toBeUndefined();
  });
});
