import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { DEVICE_REPOSITORY, ExpirePendingDevicesUseCase } from '@application/auth';
import type { DeviceRepository } from '@application/auth';
import { PENDING_DEVICE_TTL_MS, UserId } from '@domain/auth';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';

/** The second account, used wherever the rule is about one user not reaching another's. */
const OTHER = 'auth|other';

/**
 * `POST /devices`, `GET /devices` and the approval, against the real application.
 *
 * The filter, the guard, the pipe, the container and PostgreSQL are the real ones. That matters
 * more here than almost anywhere else: the composite unique key, the CHECK constraints and the
 * append-only trigger of the trail are the things this phase is actually about, and none of them
 * exists in a fake.
 */
describe('the device HTTP surface', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    harness = await startTestApp(database.url, identity);
    token = await identity.accessToken({ subject: SUBJECT });
    otherToken = await identity.accessToken({ subject: OTHER });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const context = (): PersistenceContext =>
    harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT);

  const registration = {
    installId: 'install-1',
    name: 'Pixel 8',
    platform: 'android',
    appVersion: '1.0.0',
    pushToken: 'push-token-abcdef',
    locale: 'pt-BR',
  };

  /** Registers a device, as the app does on every launch. */
  const register = (
    as: string,
    body: Record<string, unknown> = registration,
    installId?: string,
  ): request.Test => {
    const call = http().post('/devices').set('authorization', `Bearer ${as}`).send(body);

    return installId === undefined ? call : call.set('x-install-id', installId);
  };

  const approve = (as: string, deviceId: string, installId?: string): request.Test => {
    const call = http()
      .post(`/devices/${deviceId}/approval`)
      .set('authorization', `Bearer ${as}`)
      .send({});

    return installId === undefined ? call : call.set('x-install-id', installId);
  };

  const revoke = (as: string, deviceId: string): request.Test =>
    http().delete(`/devices/${deviceId}/approval`).set('authorization', `Bearer ${as}`);

  const list = (as: string): request.Test =>
    http().get('/devices').set('authorization', `Bearer ${as}`);

  beforeEach(async () => {
    // Every scenario starts from an empty account: the unique key is the point of several of
    // them, and a row left behind by the previous one would make the wrong one pass.
    //
    // `audit_events` is **not** cleaned, and cannot be: the table refuses a DELETE inside the
    // ninety-day floor, which is exactly the property the trail scenarios below assert. The
    // assertions are scoped by subject instead — a trail a test can wipe would not be a trail.
    await context().db.execute('DELETE FROM devices');
  });

  /**
   * Why the database refused a statement.
   *
   * The driver wraps the server's message in one of its own, so asserting on `message` would
   * assert on the wrapper and pass for any failure at all — including the statement succeeding
   * and something else going wrong.
   */
  const refusalFor = async (statement: string): Promise<string> => {
    try {
      await context().db.execute(statement);
    } catch (error) {
      return String((error as { cause?: { message?: string } }).cause?.message ?? error);
    }

    throw new Error(`the database accepted ${statement}`);
  };

  /** The kinds recorded about one device, oldest first. */
  const trailFor = async (deviceId: string): Promise<string[]> => {
    const rows = await context().db.execute(
      `SELECT kind FROM audit_events WHERE subject_id = '${deviceId}' ORDER BY seq`,
    );

    return rows.rows.map((row) => String(row['kind']));
  };

  describe('POST /devices', () => {
    // S-01
    it('registers a new device as pending, with 201 — S-01', async () => {
      const response = await register(token);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: 'pending', name: 'Pixel 8' });
      expect(response.body.approvedAt).toBeNull();
    });

    // S-02
    it('updates the same installation instead of adding a row — S-02', async () => {
      const first = await register(token);
      const again = await register(token, { ...registration, name: 'Pixel 9' });

      expect(again.status).toBe(201);
      expect(again.body.id).toBe(first.body.id);
      expect((await list(token)).body.devices).toHaveLength(1);
      expect(again.body.name).toBe('Pixel 9');
    });

    // S-59
    it('gives the same installation of another user its own row, with no approval — S-59', async () => {
      const mine = await register(token);
      await approve(token, mine.body.id);

      const theirs = await register(otherToken);

      expect(theirs.body.id).not.toBe(mine.body.id);
      expect(theirs.body.status).toBe('pending');
      expect((await list(otherToken)).body.devices).toHaveLength(1);
    });

    // S-62
    it('takes a rotated push token without adding a row or losing the approval — S-62', async () => {
      const first = await register(token);
      await approve(token, first.body.id);

      const rotated = await register(token, { ...registration, pushToken: 'push-token-zzzzzz' });

      // The provider changes the token on its own schedule, and the app re-sends it. Charging a
      // new approval for that would mean going back to the browser every time the operating
      // system felt like it ([D-13](../../../../../../docs/plans/02-mobile-approval/decisions.md)).
      expect(rotated.body.id).toBe(first.body.id);
      expect(rotated.body.status).toBe('approved');
      expect(rotated.body.pushEnabled).toBe(true);
      expect((await list(token)).body.devices).toHaveLength(1);
    });

    // S-12
    it('accepts a registration with no push token — S-12', async () => {
      const response = await register(token, {
        installId: 'install-2',
        name: 'Old phone',
        platform: 'android',
        appVersion: '1.0.0',
      });

      expect(response.status).toBe(201);
      expect(response.body.pushEnabled).toBe(false);
    });

    // S-11
    it('falls back to en when the app named no language — S-11', async () => {
      const response = await register(token, {
        installId: 'install-3',
        name: 'Silent phone',
        platform: 'android',
        appVersion: '1.0.0',
      });

      expect(response.body.locale).toBe('en');
    });

    it('answers 400 for a body the contract does not allow', async () => {
      const response = await register(token, { ...registration, platform: 'kaios' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('answers 401 without a credential', async () => {
      const response = await http().post('/devices').send(registration);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    // S-14, at the HTTP edge: the token goes in and never comes back out.
    it('never echoes the push token — S-14', async () => {
      const response = await register(token);

      expect(JSON.stringify(response.body)).not.toContain('push-token-abcdef');
      expect(response.body.pushEnabled).toBe(true);
    });
  });

  // The header names which of this user's devices is asking. It is not authentication — it says
  // nothing a caller did not already have as that user — and it is the absence of it that makes
  // the approval endpoint know it is talking to a browser (D-19).
  describe('the installation header', () => {
    it('is ignored when it names nothing', async () => {
      const registered = await register(token, registration, '');

      expect((await approve(token, registered.body.id, '')).status).toBe(200);
    });
  });

  // Who a push goes to, once there is a push to send: **every** approved device of the user
  // (D-04). It is read here rather than through a route because there is no route for it — the
  // notification module is F1, and this is the read it will use.
  describe('reading the approved devices', () => {
    const repository = (): DeviceRepository => harness.app.get<DeviceRepository>(DEVICE_REPOSITORY);

    it('answers every approved device of the user, and nothing else', async () => {
      const approved = await register(token);
      await approve(token, approved.body.id);
      await register(token, { ...registration, installId: 'install-2', name: 'Waiting' });
      const revoked = await register(token, {
        ...registration,
        installId: 'install-3',
        name: 'Gone',
      });
      await approve(token, revoked.body.id);
      await revoke(token, revoked.body.id);

      const found = await repository().findApprovedByUser(UserId.create(SUBJECT));

      expect(found.map((device) => device.installId)).toEqual(['install-1']);
    });

    it('never answers the approved device of somebody else', async () => {
      const theirs = await register(otherToken);
      await approve(otherToken, theirs.body.id);

      expect(await repository().findApprovedByUser(UserId.create(SUBJECT))).toEqual([]);
    });
  });

  describe('GET /devices', () => {
    it('lists only this caller devices', async () => {
      await register(token);
      await register(otherToken, { ...registration, name: 'Their phone' });

      const response = await list(token);

      expect(response.status).toBe(200);
      expect(response.body.devices).toHaveLength(1);
      expect(response.body.devices[0].name).toBe('Pixel 8');
    });

    it('never carries the install id or the push token', async () => {
      await register(token);

      expect(JSON.stringify((await list(token)).body)).not.toContain('install-1');
      expect(JSON.stringify((await list(token)).body)).not.toContain('push-token');
    });
  });

  describe('the approval', () => {
    it('lets a pending device decide', async () => {
      const registered = await register(token);

      const response = await approve(token, registered.body.id);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('approved');
      expect(response.body.approvedAt).not.toBeNull();
    });

    // S-06: a device never approves a device, not even itself.
    it('answers 403 when the caller is itself a device — S-06', async () => {
      const registered = await register(token);

      const response = await approve(token, registered.body.id, 'install-1');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect((await list(token)).body.devices[0].status).toBe('pending');
    });

    it('answers 403 even when the device it names is another one', async () => {
      const registered = await register(token);
      await register(token, { ...registration, installId: 'install-2', name: 'Second' });

      expect((await approve(token, registered.body.id, 'install-2')).status).toBe(403);
    });

    it('answers 404 for a device of somebody else, exactly as for one that does not exist', async () => {
      const theirs = await register(otherToken);

      expect((await approve(token, theirs.body.id)).status).toBe(404);
      expect((await approve(token, 'nope')).status).toBe(404);
    });

    it('approving twice is a successful no-op', async () => {
      const registered = await register(token);
      await approve(token, registered.body.id);

      const again = await approve(token, registered.body.id);

      expect(again.status).toBe(200);
      expect(again.body.status).toBe('approved');
    });

    // S-10: revoked is terminal, so the two orders converge on the safe end.
    it('refuses to approve a revoked device — S-10', async () => {
      const registered = await register(token);
      await approve(token, registered.body.id);
      await revoke(token, registered.body.id);

      const response = await approve(token, registered.body.id);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('DEVICE_REVOKED');
    });
  });

  describe('the revocation', () => {
    it('takes the device out and keeps the row', async () => {
      const registered = await register(token);
      await approve(token, registered.body.id);

      const response = await revoke(token, registered.body.id);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('revoked');
      expect(response.body.revokedAt).not.toBeNull();
      expect((await list(token)).body.devices).toHaveLength(1);
    });

    // S-09
    it('revoking twice is a successful no-op — S-09', async () => {
      const registered = await register(token);
      await revoke(token, registered.body.id);

      const again = await revoke(token, registered.body.id);

      expect(again.status).toBe(200);
      expect(again.body.status).toBe('revoked');
    });

    it('answers 404 for a device of somebody else', async () => {
      const theirs = await register(otherToken);

      expect((await revoke(token, theirs.body.id)).status).toBe(404);
    });

    it('never revives a revoked device by registering it again', async () => {
      const registered = await register(token);
      await revoke(token, registered.body.id);

      expect((await register(token)).body.status).toBe('revoked');
    });
  });

  // S-13: the three facts reach the trail, in the table that refuses to be rewritten.
  describe('the trail', () => {
    it('records the registration, the approval and the revocation — S-13', async () => {
      const registered = await register(token);
      // The second registration is the one that must **not** appear: the app calls it on every
      // launch, and a row per launch buries the three facts somebody is looking for.
      await register(token);
      await approve(token, registered.body.id);
      await revoke(token, registered.body.id);

      expect(await trailFor(registered.body.id)).toEqual([
        'device.registered',
        'device.approved',
        'device.revoked',
      ]);

      const rows = await context().db.execute(
        `SELECT subject_label FROM audit_events WHERE subject_id = '${registered.body.id}' LIMIT 1`,
      );

      expect(rows.rows[0]?.['subject_label']).toBe('Pixel 8');
    });

    it('refuses to be rewritten, whoever is connected', async () => {
      const registered = await register(token);

      expect(
        await refusalFor(
          `UPDATE audit_events SET kind = 'device.approved' WHERE subject_id = '${registered.body.id}'`,
        ),
      ).toMatch(/append-only/);
    });

    it('refuses to be deleted inside the retention floor', async () => {
      const registered = await register(token);

      expect(
        await refusalFor(`DELETE FROM audit_events WHERE subject_id = '${registered.body.id}'`),
      ).toMatch(/90 days/);
    });
  });

  // S-60: the forgotten registration goes, and going twice changes nothing.
  describe('the sweep of forgotten registrations', () => {
    const age = async (installId: string, days: number): Promise<void> => {
      await context().db.execute(
        `UPDATE devices SET registered_at = now() - interval '${String(days)} days' ` +
          `WHERE install_id = '${installId}'`,
      );
    };

    const sweep = (): Promise<number> => harness.app.get(ExpirePendingDevicesUseCase).execute();

    it('leaves the sixth day approvable and removes the eighth — S-60', async () => {
      const registered = await register(token);
      await age('install-1', 6);

      expect(await sweep()).toBe(0);
      expect((await approve(token, registered.body.id)).status).toBe(200);
    });

    it('removes a pending registration past the deadline, and a second sweep changes nothing — S-60', async () => {
      await register(token);
      await age('install-1', 8);

      expect(await sweep()).toBe(1);
      expect(await sweep()).toBe(0);
      expect((await list(token)).body.devices).toHaveLength(0);
    });

    it('records the expiry in the trail', async () => {
      const registered = await register(token);
      await age('install-1', 8);

      await sweep();

      expect(await trailFor(registered.body.id)).toEqual(['device.registered', 'device.expired']);
    });

    it('refuses to approve a forgotten registration even before the sweep runs — S-60', async () => {
      const registered = await register(token);
      await age('install-1', PENDING_DEVICE_TTL_MS / (24 * 60 * 60 * 1000) + 1);

      expect((await approve(token, registered.body.id)).status).toBe(404);
    });

    it('never touches an approved device', async () => {
      const registered = await register(token);
      await approve(token, registered.body.id);
      await age('install-1', 400);

      expect(await sweep()).toBe(0);
      expect((await list(token)).body.devices).toHaveLength(1);
    });
  });
});
