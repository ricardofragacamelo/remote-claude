import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AUDIT_REPOSITORY } from '@application/audit';
import type { AuditRepository } from '@application/audit';
import { AuditEntry } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

const OTHER = 'auth|other';
const MINE = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const THEIRS = '01J0ABCDEFGHJKMNPQRSTVWXY1';
const NOBODYS = '01J0ABCDEFGHJKMNPQRSTVWXY2';
const at = new Date('2026-09-24T12:00:00.000Z');

/**
 * `GET /audit-entries`, against the real application — plan 03, F2.
 *
 * The guard, the pipe, the filter and PostgreSQL are the real ones. What is proved here is the
 * edge: each answer with its status, a cursor that round-trips as the opaque string the client
 * sees, and nothing of another person's — or of a file's contents — ever in a body.
 */
describe('the audit trail HTTP surface', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let written = 0;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity);
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
    await db.execute(sql`ALTER TABLE "audit_entries" DISABLE TRIGGER USER`);
    await db.execute(sql`TRUNCATE TABLE "audit_entries"`);
    await db.execute(sql`ALTER TABLE "audit_entries" ENABLE TRIGGER USER`);
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const read = (query: Record<string, string> = {}, as: string | null = token): request.Test => {
    const call = http().get('/audit-entries').query(query);
    return as === null ? call : call.set('authorization', `Bearer ${as}`);
  };

  async function write(
    overrides: {
      userId?: string;
      sessionId?: string;
      toolName?: string;
      toolKind?: string | null;
      input?: object;
    } = {},
  ): Promise<string> {
    written += 1;
    const id = `01J0AUDITAPI${String(written).padStart(14, '0')}`;

    await harness.app.get<AuditRepository>(AUDIT_REPOSITORY).append(
      AuditEntry.record({
        id,
        userId: UserId.create(overrides.userId ?? SUBJECT),
        sessionId: SessionId.create(overrides.sessionId ?? MINE),
        toolUseId: `tu-${String(written)}`,
        toolName: overrides.toolName ?? 'Bash',
        toolKind: overrides.toolKind === undefined ? 'shell' : overrides.toolKind,
        input: (overrides.input as Record<string, unknown> | undefined) ?? { command: 'ls' },
        decision: 'recorded',
        origin: { deviceId: null, ip: null },
        at,
      }),
    );

    return id;
  }

  it('answers `401` to nobody in particular', async () => {
    expect((await read({}, null)).status).toBe(401);
  });

  it('answers the caller`s trail, and only theirs, with `200`', async () => {
    const mine = await write();
    await write({ userId: OTHER, sessionId: THEIRS });

    const response = await read();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      entries: [
        {
          id: mine,
          sessionId: MINE,
          toolUseId: expect.any(String),
          toolName: 'Bash',
          kind: 'shell',
          input: { command: 'ls' },
          decision: 'recorded',
          at: at.toISOString(),
          traceId: null,
          verdict: null,
        },
      ],
      nextCursor: null,
    });
  });

  it('refuses a session that is somebody else`s, with `403` — S-26', async () => {
    await write({ userId: OTHER, sessionId: THEIRS });

    const response = await read({ sessionId: THEIRS });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: 'FORBIDDEN',
      messageKey: 'audit.error.forbidden',
    });
  });

  it('answers a session with no entry with an empty page, not `403` — S-73', async () => {
    const response = await read({ sessionId: NOBODYS });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ entries: [], nextCursor: null });
  });

  it('never hands back what a `file.read` read, only its path — S-27, plan 28 S-52', async () => {
    await write({ toolName: 'Read', input: { file_path: '/srv/.env', content: 'SECRET=1' } });

    const response = await read();

    // Read by the kind the engine's classifier gives the entry (plan 28, D-31).
    expect(response.body.entries[0].input).toEqual({ paths: ['/srv/.env'] });
    expect(response.text).not.toContain('SECRET');
  });

  it('pages with the cursor it hands out, as an opaque string', async () => {
    const [first, second, third] = [await write(), await write(), await write()];

    const top = await read({ limit: '2' });
    expect(top.body.entries.map((entry: { id: string }) => entry.id)).toEqual([third, second]);
    expect(typeof top.body.nextCursor).toBe('string');

    const rest = await read({ limit: '2', cursor: top.body.nextCursor });
    expect(rest.body.entries.map((entry: { id: string }) => entry.id)).toEqual([first]);
    expect(rest.body.nextCursor).toBeNull();
  });

  it('crosses every filter the route takes, and answers only the intersection — S-72', async () => {
    await write({ toolName: 'Bash' });
    const hit = await write({ toolName: 'Write' });
    await write({ toolName: 'Write', sessionId: THEIRS, userId: OTHER });

    const response = await read({
      sessionId: MINE,
      toolName: 'Write',
      decision: 'recorded',
      from: new Date(at.getTime() - 1).toISOString(),
      to: new Date(at.getTime() + 1).toISOString(),
      limit: '10',
    });

    expect(response.status).toBe(200);
    expect(response.body.entries.map((entry: { id: string }) => entry.id)).toEqual([hit]);
  });

  it('excludes the entry that falls on the end of the period — S-24', async () => {
    await write();

    const response = await read({
      from: new Date(at.getTime() - 1).toISOString(),
      to: at.toISOString(),
    });

    expect(response.body.entries).toEqual([]);
  });

  it.each([
    [
      'a period that ends before it starts',
      { from: '2026-09-02T00:00:00Z', to: '2026-09-01T00:00:00Z' },
    ],
    ['a cursor this server never handed out', { cursor: 'abc' }],
    ['a page above the ceiling', { limit: '101' }],
    ['a page of none', { limit: '0' }],
    ['a decision the trail does not have', { decision: 'maybe' }],
  ])('refuses %s with `400` — S-70', async (_label, query) => {
    const response = await read(query);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('filters by the kind of the call, and says it beside the engine name — plan 28, B-33', async () => {
    const shell = await write();
    const edit = await write({
      toolName: 'Edit',
      toolKind: 'file.edit',
      input: { file_path: '/srv/a.ts' },
    });
    // Written before the trail kept the kind: the query reads it from the classifier, and only the
    // data step at boot makes it filterable.
    const old = await write({
      toolName: 'Write',
      toolKind: null,
      input: { file_path: '/srv/b.ts' },
    });

    const edits = await read({ kind: 'file.edit' });
    const all = await read();

    expect(edits.body.entries.map((entry: { id: string }) => entry.id)).toEqual([edit]);
    expect(
      all.body.entries.map((entry: { id: string; kind: string }) => [entry.id, entry.kind]),
    ).toEqual([
      [old, 'file.write'],
      [edit, 'file.edit'],
      [shell, 'shell'],
    ]);
  });

  it('refuses a kind that is not one, with `400`', async () => {
    expect((await read({ kind: 'Bash' })).status).toBe(400);
  });

  it('refuses a session id that is not one, with `400`', async () => {
    const response = await read({ sessionId: 'not-a-session' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_INPUT',
      messageKey: 'session.error.invalidSessionId',
    });
  });
});
