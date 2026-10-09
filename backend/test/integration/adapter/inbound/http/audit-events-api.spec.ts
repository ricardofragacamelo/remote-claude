import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

import { RecordAuditEventUseCase } from '@application/audit';
import { AUDIT_EVENT_KINDS } from '@domain/audit';
import type { AuditEventKind } from '@domain/audit';
import { UserId } from '@domain/auth';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

const MIGRATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../src/infrastructure/database/migrations',
);

/** Another person of the same installation. */
const OTHER = 'auth|other';

/**
 * `GET /audit-events` — the account facts, read, and the person's file facts among them (plan 07,
 * B-16 and B-17).
 *
 * Facts are recorded through the real use case into the real table, with the CHECK of migration
 * `0016`, and read back through the real route.
 */
describe('reading the account facts', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let instant = Date.parse('2026-09-30T12:00:00Z');

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder,
      writeTestAllowlist([SUBJECT, OTHER]),
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const record = (kind: AuditEventKind, label: string, subject = SUBJECT): Promise<string> => {
    instant += 1_000;

    return harness.app.get(RecordAuditEventUseCase).execute({
      userId: UserId.create(subject),
      kind,
      subjectId: `/srv/${label}`,
      subjectLabel: label,
      details: { sizeBytes: 1 },
      at: new Date(instant),
    });
  };

  const page = (query: Record<string, string>, bearer = token): request.Test =>
    request(harness.app.getHttpServer())
      .get(`/audit-events?${new URLSearchParams(query).toString()}`)
      .set('authorization', `Bearer ${bearer}`);

  it('accepts every file kind, through a migration that left 0013 alone — S-119', async () => {
    for (const kind of AUDIT_EVENT_KINDS.filter((each) => each.startsWith('file.'))) {
      await expect(record(kind, `kinds/${kind}`)).resolves.toEqual(expect.any(String));
    }

    const undo = await readFile(path.join(MIGRATIONS, '0013_undo_reach.sql'), 'utf8');
    const files = await readFile(path.join(MIGRATIONS, '0016_file_events.sql'), 'utf8');

    expect(undo).not.toContain("'file.");
    expect(files).toContain("'file.failed'");
  });

  it('accepts every claude kind through 0020, which left 0019 alone — plan 13, S-13', async () => {
    for (const kind of AUDIT_EVENT_KINDS.filter((each) => each.startsWith('claude.'))) {
      await expect(record(kind, `kinds/${kind}`)).resolves.toEqual(expect.any(String));
    }

    const answers = await readFile(path.join(MIGRATIONS, '0019_permission_answers.sql'), 'utf8');
    const claude = await readFile(path.join(MIGRATIONS, '0020_claude_config.sql'), 'utf8');

    expect(answers).not.toContain("'claude.");
    expect(claude).toContain("'claude.skillSourceToggled'");
  });

  it('refuses, in the database, a kind no migration declared — plan 13, S-13', async () => {
    const { db } = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT);

    await expect(
      db.execute(
        `INSERT INTO audit_events (id, user_id, kind, subject_id, subject_label, at)
         VALUES ('01JUNKNOWNKIND0000000000000', 'auth|42', 'claude.somethingElse', 's', 's', now())`,
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'audit_events_kind_known' } });
  });

  it("answers the caller's file facts, newest first — S-120", async () => {
    await record('device.registered', 'a-phone');
    const older = await record('file.created', 'first.ts');
    const newer = await record('file.written', 'first.ts');

    const response = await page({ kind: 'file.' });

    expect(response.status).toBe(200);
    const events = response.body.events as { id: string; kind: string; at: string }[];
    expect(events.every((event) => event.kind.startsWith('file.'))).toBe(true);
    expect(events.slice(0, 2).map((event) => event.id)).toEqual([newer, older]);
    expect(events[0]).toMatchObject({
      kind: 'file.written',
      subjectId: '/srv/first.ts',
      subjectLabel: 'first.ts',
      details: { sizeBytes: 1 },
    });
  });

  it('narrows to one kind when the prefix names it', async () => {
    const events = (await page({ kind: 'file.written' })).body.events as { kind: string }[];

    expect(new Set(events.map((event) => event.kind))).toEqual(new Set(['file.written']));
  });

  it("answers nothing to a person with no facts, and never somebody else's — S-121", async () => {
    const stranger = await identity.accessToken({ subject: 'auth|nobody' });
    const other = await identity.accessToken({ subject: OTHER });
    await record('file.deleted', 'theirs.ts', OTHER);

    const empty = await page({}, stranger);
    const theirs = (await page({ kind: 'file.' }, other)).body.events as { subjectLabel: string }[];
    const mine = (await page({ kind: 'file.', limit: '100' })).body.events as {
      subjectLabel: string;
    }[];

    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ events: [], nextCursor: null });
    expect(theirs.map((event) => event.subjectLabel)).toEqual(['theirs.ts']);
    expect(mine.map((event) => event.subjectLabel)).not.toContain('theirs.ts');
  });

  it.each([
    [{ cursor: '0' }, 'cursor'],
    [{ cursor: 'abc' }, 'cursor'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ kind: 'file.%' }, 'kind'],
  ])('refuses %o — S-122', async (query, field) => {
    const response = await page(query);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
    expect(response.body.error.details[0].field).toBe(field);
  });

  it('neither skips nor repeats a fact written between two pages — S-123', async () => {
    for (const name of ['p1', 'p2', 'p3', 'p4']) {
      await record('file.copied', `pages/${name}`);
    }

    const first = await page({ kind: 'file.copied', limit: '2' });
    const written = await record('file.copied', 'pages/late');
    const second = await page({ kind: 'file.copied', limit: '2', cursor: first.body.nextCursor });

    const labels = [...first.body.events, ...second.body.events].map(
      (event: { subjectLabel: string }) => event.subjectLabel,
    );
    expect(labels).toEqual(['pages/p4', 'pages/p3', 'pages/p2', 'pages/p1']);
    expect((await page({ kind: 'file.copied', limit: '1' })).body.events[0].id).toBe(written);
  });
});
