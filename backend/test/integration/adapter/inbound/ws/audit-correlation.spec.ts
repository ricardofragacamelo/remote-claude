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
import { waitFor } from '../../../../support/app/wait-for';

/** The one invocation the recorded run asks about, and the narrowest rule that covers it. */
const RECORDED_PATTERN = 'Write(/workspace/summary.md)';

interface EntryDto {
  readonly id: string;
  readonly toolName: string;
  readonly decision: string;
  readonly traceId: string | null;
  readonly verdict: Record<string, unknown> | null;
}

/**
 * From an entry of the trail to what happened — plan 03, F2, B-15.
 *
 * A real turn over a real socket, and then the trail read back over HTTP, the way the screen
 * reads it. What is proved is the correlation: an automatic entry names its rule, a person's
 * names who and from where, and every entry carries the trace of the command behind it — the same
 * one its log lines and its events carry.
 */
describe('the correlation of the trail', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let connection: DatabaseConnection;
  let root: string;
  let token: string;
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
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
      { RC_PERMISSION_TIMEOUT_MS: '30000' },
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterEach(async () => {
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

  async function connect(): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);

    socket.send(
      commandFrame('connection.authenticate', {
        token,
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await socket.next();

    return socket;
  }

  /** Every frame up to and including the first of one of `types`. */
  async function framesUntil(socket: TestSocket, ...types: string[]): Promise<Envelope[]> {
    const frames: Envelope[] = [];

    for (let taken = 0; taken < 400; taken += 1) {
      const frame = await socket.next();
      frames.push(frame);

      if (types.includes(frame.type)) {
        return frames;
      }
    }

    throw new Error(`none of ${types.join(', ')} in: ${frames.map((f) => f.type).join(', ')}`);
  }

  async function startSession(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const frames = await framesUntil(socket, 'session.started');

    return String(frames.at(-1)?.payload?.['sessionId']);
  }

  /** One turn, prompted under a trace of the test's choosing. */
  function prompt(socket: TestSocket, sessionId: string, traceId: string): void {
    socket.send(commandFrame('session.prompt', { sessionId, text: 'do the work' }, { traceId }));
  }

  async function grantAlways(): Promise<string> {
    const response = await http()
      .post('/permission-rules')
      .set('authorization', `Bearer ${token}`)
      .send({ pattern: RECORDED_PATTERN, decision: 'allow', scope: 'always' });

    return String(response.body.id);
  }

  async function trail(query: Record<string, string>): Promise<EntryDto[]> {
    const response = await http()
      .get('/audit-entries')
      .query(query)
      .set('authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);

    return response.body.entries as EntryDto[];
  }

  /** The decision entries of a session, once the listener — which is not awaited — wrote them. */
  const decisions = (sessionId: string, count = 1): Promise<EntryDto[]> =>
    waitFor(
      'the decision reaching the trail',
      () => trail({ sessionId, decision: 'allowed' }),
      (entries) => entries.length >= count,
    );

  it('names the rule that answered, on an entry nobody was asked about — S-30', async () => {
    const ruleId = await grantAlways();
    const socket = await connect();
    const sessionId = await startSession(socket);

    prompt(socket, sessionId, 'trace-ruled');
    const frames = await framesUntil(socket, 'turn.completed', 'permission.requested');
    expect(frames.at(-1)?.type).toBe('turn.completed');

    const [entry] = await decisions(sessionId);

    expect(entry?.toolName).toBe('Write');
    expect(entry?.verdict).toMatchObject({
      auto: true,
      ruleId,
      scope: 'always',
      resolvedBy: SUBJECT,
      resolvedFrom: null,
    });
  });

  it('leads from the entry to its rule after the rule was revoked, with the state — S-50', async () => {
    const ruleId = await grantAlways();
    const socket = await connect();
    const sessionId = await startSession(socket);
    prompt(socket, sessionId, 'trace-revoked');
    await framesUntil(socket, 'turn.completed');

    await http().delete(`/permission-rules/${ruleId}`).set('authorization', `Bearer ${token}`);

    const [entry] = await decisions(sessionId);
    const rule = await http()
      .get(`/permission-rules/${String(entry?.verdict?.['ruleId'])}`)
      .set('authorization', `Bearer ${token}`);

    expect(rule.status).toBe(200);
    expect(rule.body).toMatchObject({ id: ruleId, status: 'revoked', pattern: RECORDED_PATTERN });
  });

  it('names who answered and from where, on an entry a person decided — S-79', async () => {
    const socket = await connect();
    const sessionId = await startSession(socket);
    prompt(socket, sessionId, 'trace-asked');

    const asked = (await framesUntil(socket, 'permission.requested')).at(-1);
    socket.send(
      commandFrame(
        'permission.resolve',
        { requestId: asked?.payload?.['requestId'], decision: 'allow', scope: 'once' },
        { traceId: 'trace-answer' },
      ),
    );
    await framesUntil(socket, 'turn.completed');

    const [entry] = await decisions(sessionId);

    expect(entry?.verdict).toMatchObject({
      requestId: asked?.payload?.['requestId'],
      auto: false,
      ruleId: null,
      scope: 'once',
      resolvedBy: SUBJECT,
      resolvedFrom: 'web',
    });
    // The decision is the answer's fact, and carries the answer's trace — not the turn's (D-16).
    expect(entry?.traceId).toBe('trace-answer');
  });

  it('ties the entry to its log lines and its events by the trace of the turn — S-31', async () => {
    await grantAlways();
    const socket = await connect();
    const sessionId = await startSession(socket);

    prompt(socket, sessionId, 'trace-turn-1');
    const frames = await framesUntil(socket, 'turn.completed');

    const recorded = await trail({ sessionId, decision: 'recorded' });
    expect(recorded.length).toBeGreaterThan(0);
    expect(new Set(recorded.map((entry) => entry.traceId))).toEqual(new Set(['trace-turn-1']));

    // The events of the turn carry it…
    const events = frames.filter((frame) => frame.kind === 'event');
    expect(events.length).toBeGreaterThan(0);
    expect(new Set(events.map((frame) => frame.traceId))).toEqual(new Set(['trace-turn-1']));

    // …and so do the log lines of the writes that produced those entries.
    const writes = harness.log
      .withOp('db.query')
      .filter((line) => line['operation'] === 'audit.append' && line['traceId'] === 'trace-turn-1');
    expect(writes.length).toBeGreaterThanOrEqual(recorded.length);
  });

  it('gives each turn of one session its own trace — S-76', async () => {
    await grantAlways();
    const socket = await connect();
    const sessionId = await startSession(socket);

    prompt(socket, sessionId, 'trace-first');
    await framesUntil(socket, 'turn.completed');
    prompt(socket, sessionId, 'trace-second');
    await framesUntil(socket, 'turn.completed');

    const recorded = await trail({ sessionId, decision: 'recorded' });
    const traces = new Set(recorded.map((entry) => entry.traceId));

    expect(traces).toEqual(new Set(['trace-first', 'trace-second']));
    // Newest first: the second turn's entries are all above the first's.
    const firstOfFirst = recorded.findIndex((entry) => entry.traceId === 'trace-first');
    expect(recorded.slice(firstOfFirst).every((entry) => entry.traceId === 'trace-first')).toBe(
      true,
    );
  });
});
