import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';

/**
 * The history of the notification centre, against the real application — the guard, the pipe,
 * the filter, the interceptor that logs the edge — and a real PostgreSQL (plan 06, B-40).
 */
describe('the notification routes', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let strangerToken: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity);
    token = await identity.accessToken({ subject: SUBJECT });
    strangerToken = await identity.accessToken({ subject: 'auth|stranger' });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute(sql`TRUNCATE TABLE "notifications"`);
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const as = (bearer: string) => ({ authorization: `Bearer ${bearer}` });

  const notification = (overrides: Record<string, unknown> = {}) => ({
    clientId: 'client-1',
    severity: 'warning',
    messageKey: 'notification.folder.notAllowed',
    params: { folder: '/srv/secret-folder' },
    count: 3,
    ...overrides,
  });

  const record = (body: Record<string, unknown>, bearer: string = token) =>
    http().post('/notifications').send(body).set(as(bearer));
  const history = (bearer: string = token) => http().get('/notifications').set(as(bearer));

  it('keeps a notification and lists it, newest first, with the unread count — S-167', async () => {
    const created = await record(notification({ clientId: 'old' }));
    await record(notification({ clientId: 'new' }));

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      severity: 'warning',
      messageKey: 'notification.folder.notAllowed',
      params: { folder: '/srv/secret-folder' },
      count: 3,
      createdAt: expect.any(String),
      readAt: null,
    });

    const page = await history();
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.items[0].id).not.toBe(created.body.id);
    expect(page.body).toMatchObject({ unread: 2, nextCursor: null });
  });

  it('never shows, marks or deletes the notifications of somebody else — S-168', async () => {
    const theirs = await record(notification(), strangerToken);

    expect((await history()).body.items).toEqual([]);
    await http()
      .put('/notifications/read')
      .send({ ids: [theirs.body.id] })
      .set(as(token));
    await http()
      .delete(`/notifications/${String(theirs.body.id)}`)
      .set(as(token));

    const still = await history(strangerToken);
    expect(still.body).toMatchObject({ unread: 1 });
    expect(still.body.items).toHaveLength(1);
  });

  it('answers 200 with the entry already kept for the same client id — S-169', async () => {
    const first = await record(notification());
    const again = await record(notification());

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect((await history()).body.items).toHaveLength(1);
  });

  it('answers 204 marking read twice, an id that is not there, and all twice — S-172', async () => {
    const kept = await record(notification());
    const mark = (ids: string[]) => http().put('/notifications/read').send({ ids }).set(as(token));

    expect((await mark([kept.body.id])).status).toBe(204);
    const readAt = (await history()).body.items[0].readAt as string;
    expect((await mark([kept.body.id])).status).toBe(204);
    expect((await mark(['not-there'])).status).toBe(204);
    expect((await http().put('/notifications/read-all').set(as(token))).status).toBe(204);
    expect((await http().put('/notifications/read-all').set(as(token))).status).toBe(204);

    expect((await history()).body.items[0].readAt).toBe(readAt);
  });

  it('reads the same on a second device: read on one, read on the other — S-173', async () => {
    const kept = await record(notification());
    const desktop = await identity.accessToken({ subject: SUBJECT });
    const phone = await identity.accessToken({ subject: SUBJECT });

    await http()
      .put('/notifications/read')
      .send({ ids: [kept.body.id] })
      .set(as(desktop));

    const onPhone = await history(phone);
    expect(onPhone.body.unread).toBe(0);
    expect(onPhone.body.items[0].readAt).not.toBeNull();
  });

  it.each([
    ['a key outside the catalogue', { messageKey: 'made.up.key' }, 'messageKey'],
    ['an unknown severity', { severity: 'loud' }, 'severity'],
    [
      'a parameter the key does not take',
      { params: { folder: '/x', command: 'rm' } },
      'params.command',
    ],
    ['a parameter that is a structure', { params: { folder: { deep: 1 } } }, 'params.folder'],
    ['a field the contract does not name', { content: 'the conversation' }, ''],
    ['a count of zero', { count: 0 }, 'count'],
  ])('refuses %s, and keeps nothing — S-174', async (_case, change, field) => {
    const refused = await record(notification(change));

    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('INVALID_INPUT');
    if (field !== '') {
      expect(refused.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    }
    expect((await history()).body.items).toEqual([]);
  });

  it('answers 401 on every route without a credential — S-175', async () => {
    const responses = await Promise.all([
      http().get('/notifications'),
      http().post('/notifications').send(notification()),
      http()
        .put('/notifications/read')
        .send({ ids: ['x'] }),
      http().put('/notifications/read-all'),
      http().delete('/notifications/x'),
      http().delete('/notifications'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });

  it('answers 204 deleting one, and clearing, also with nothing to delete — S-177', async () => {
    const kept = await record(notification({ clientId: 'a' }));
    await record(notification({ clientId: 'b' }));

    expect(
      (
        await http()
          .delete(`/notifications/${String(kept.body.id)}`)
          .set(as(token))
      ).status,
    ).toBe(204);
    expect(
      (
        await http()
          .delete(`/notifications/${String(kept.body.id)}`)
          .set(as(token))
      ).status,
    ).toBe(204);
    expect((await history()).body.items).toHaveLength(1);
    expect((await http().delete('/notifications').set(as(token))).status).toBe(204);
    expect((await http().delete('/notifications').set(as(token))).status).toBe(204);
    expect((await history()).body.items).toEqual([]);
  });

  it('logs the severity, the key and the count at the edge — never the parameters — S-178', async () => {
    await record(notification({ clientId: 'logged' }));

    const lines = harness.log.lines.filter((line) => JSON.stringify(line).includes('notification'));
    expect(harness.log.withOp('notification.recorded').at(-1)).toMatchObject({
      level: 'debug',
      severity: 'warning',
      messageKey: 'notification.folder.notAllowed',
      count: 3,
    });
    expect(JSON.stringify(lines)).not.toContain('secret-folder');
  });

  it('answers 400 for a cursor that was not issued here', async () => {
    const response = await http().get('/notifications').query({ cursor: 'abc' }).set(as(token));

    expect(response.status).toBe(400);
  });
});
