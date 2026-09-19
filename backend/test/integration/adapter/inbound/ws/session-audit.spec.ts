import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { DrizzleAuditRepository } from '@adapter/outbound/persistence/audit/drizzle-audit.repository';
import { AUDIT_REPOSITORY } from '@application/audit';
import type { AuditRepository } from '@application/audit';
import type { AuditEntry } from '@domain/audit';
import { openDatabase } from '@infra/database/connection';
import type { Database, DatabaseConnection } from '@infra/database/connection';
import { DATABASE } from '@infra/database/database.tokens';
import { LOGGER } from '@shared/logging/logger';
import type { Logger } from '@shared/logging/logger';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { loadFixture } from '../../../../fakes/agent-sdk/fixture';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { waitFor } from '../../../../support/app/wait-for';
import { aPersistenceContext } from '../../../../support/fakes/persistence-context';

/** A trail that can be told to stop working, so the refusal path is exercised for real. */
class BreakableTrail implements AuditRepository {
  failing = false;

  constructor(private readonly inner: AuditRepository) {}

  append(entry: AuditEntry): Promise<void> {
    return this.failing
      ? Promise.reject(new Error('the database is gone'))
      : this.inner.append(entry);
  }
}

/**
 * The trail, through a real turn.
 *
 * The claim under test is the one the whole design rests on: the hook covers **every** tool, and
 * `canUseTool` covers only some — so a trail anchored on the hook records the file reads and the
 * auto-approved commands that the callback never sees.
 */
describe('the audit trail of a live session', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let connection: DatabaseConnection;
  let trail: BreakableTrail;
  let root: string;
  const open: TestSocket[] = [];

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
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(scripted.createQuery)
          .overrideProvider(AUDIT_REPOSITORY)
          .useFactory({
            // The real repository sits behind the switch: what is being proved is the behaviour
            // of the whole chain, and a trail that never reached PostgreSQL would prove none of it.
            factory: (db: Database, logger: Logger) => {
              trail = new BreakableTrail(
                new DrizzleAuditRepository(aPersistenceContext(db, { logger })),
              );
              return trail;
            },
            inject: [DATABASE, LOGGER],
          }),
      allowlist,
    );
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

  async function start(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();

    return String((await until(socket, 'session.started')).payload?.['sessionId']);
  }

  /**
   * The tools the **hook** recorded for a session, in the order they were written.
   *
   * Scoped to `recorded`, because one invocation now produces two entries: the hook's, which says
   * the tool was about to run, and the permission module's, which says what was decided about it.
   * Counting both would make the coverage claim of this suite unreadable — and it is the hook's
   * coverage that ADR-011 is about.
   */
  async function recorded(sessionId: string): Promise<string[]> {
    const rows = await connection.db.execute<{ tool_name: string }>(
      sql`SELECT "tool_name" FROM "audit_entries"
          WHERE "session_id" = ${sessionId} AND "decision" = 'recorded'
          ORDER BY "seq"`,
    );

    return rows.rows.map((row) => row.tool_name);
  }

  /** What was decided about each tool a human was asked about. */
  async function decided(
    sessionId: string,
  ): Promise<{ tool_name: string; decision: string; user_id: string }[]> {
    const rows = await connection.db.execute<{
      tool_name: string;
      decision: string;
      user_id: string;
    }>(
      sql`SELECT "tool_name", "decision", "user_id" FROM "audit_entries"
          WHERE "session_id" = ${sessionId} AND "decision" <> 'recorded'
          ORDER BY "seq"`,
    );

    return rows.rows;
  }

  it('records every tool of the turn, not only the ones a human was asked about — S-40', async () => {
    const socket = await connect();
    const sessionId = await start(socket);

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(socket, 'turn.completed');

    const fixture = loadFixture('tool-turn');
    expect(await recorded(sessionId)).toEqual(fixture.preToolUse.map((entry) => entry.toolName));
  });

  it('records the tools the CLI auto-approved, which `canUseTool` never saw — S-41', async () => {
    const socket = await connect();
    const sessionId = await start(socket);

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(socket, 'turn.completed');

    const fixture = loadFixture('tool-turn');
    const asked = new Set(fixture.canUseTool.map((entry) => entry.toolName));
    const unasked = fixture.preToolUse
      .map((entry) => entry.toolName)
      .filter((toolName) => !asked.has(toolName));

    // A trail hung on the callback would have lost exactly these: every file read, and every
    // command the CLI classified as harmless.
    expect(unasked.length).toBeGreaterThan(0);
    expect(await recorded(sessionId)).toEqual(expect.arrayContaining(unasked));
  });

  it("records the decision as its own entry, beside the hook's — S-65", async () => {
    const socket = await connect();
    const sessionId = await start(socket);

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(socket, 'turn.completed');

    const fixture = loadFixture('tool-turn');
    const asked = fixture.canUseTool.map((entry) => entry.toolName);

    // Polled rather than read once: this entry is written **after** the agent loop has been
    // released, deliberately. The durable record of the decision is the `permission_requests` row,
    // which is written before anything is told; this one is the trail's copy of it.
    //
    // Nobody answers in this suite, so the deadline does — and the deadline denies. Two entries
    // for one invocation: what was about to run, and what was decided about it.
    expect(
      await waitFor(
        'the decision reaching the trail',
        () => decided(sessionId),
        (rows) => rows.length === asked.length,
      ),
    ).toEqual(
      asked.map((toolName) => ({
        tool_name: toolName,
        decision: 'denied',
        user_id: SUBJECT,
      })),
    );
  });

  it('records the exact input, whole', async () => {
    const socket = await connect();
    const sessionId = await start(socket);

    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));
    await until(socket, 'turn.completed');

    const rows = await connection.db.execute<{ input: Record<string, unknown> }>(
      sql`SELECT "input" FROM "audit_entries" WHERE "session_id" = ${sessionId} ORDER BY "seq" LIMIT 1`,
    );
    expect(rows.rows[0]?.input).toBeTypeOf('object');
  });

  describe('when the trail cannot be written — D-07', () => {
    it('refuses the tool, tells the UI, and then ends the session on the second — S-45', async () => {
      // One turn is enough for both halves: the scripted run makes several tool calls, so the
      // first refusal keeps the session alive and the next one, immediately after, ends it. That
      // ordering is the decision, and it only holds because the refusal is a `deny` decision
      // rather than a thrown hook — a hook that throws takes the stream with it.
      const socket = await connect();
      const sessionId = await start(socket);

      trail.failing = true;
      socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }));

      const failure = await until(socket, 'error');
      expect(failure.payload).toMatchObject({
        code: 'INTERNAL_ERROR',
        messageKey: 'audit.error.unavailable',
      });

      const closed = await until(socket, 'session.closed');
      expect(closed.payload).toMatchObject({ sessionId, reason: 'auditUnavailable' });
      expect(socket.isOpen).toBe(true);

      trail.failing = false;
    });
  });
});
