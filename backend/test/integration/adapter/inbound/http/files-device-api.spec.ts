import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { plantFolder } from '../../../../support/files/folder-fixture';

const OTHER = 'auth|other';
const INSTALL = 'phone-1';

/**
 * `/files/*` only for an approved device, against the real application — plan 25, B-32 (D-12, D-24).
 *
 * The web's token reads and writes as it always has. Every other token — the app's, one with no
 * `azp` — needs the `x-install-id` of an approved device of that same person, read at every
 * request: approving in the browser lets the next one through, and revoking stops it.
 */
describe('the files HTTP surface — only an approved device reads the folder', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let web: string;
  let app: string;
  let azpless: string;
  let otherApp: string;
  let folder: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT, OTHER]);
    folder = plantFolder(allowlist.root).folder;

    harness = await startTestApp(database.url, identity, (builder) => builder, allowlist);
    web = await identity.accessToken({ subject: SUBJECT });
    app = await identity.accessToken({ subject: SUBJECT, clientId: 'remote-claude-mobile' });
    azpless = await identity.accessToken({ subject: SUBJECT, clientId: null });
    otherApp = await identity.accessToken({ subject: OTHER, clientId: 'remote-claude-mobile' });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM devices');
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  /** The four reads of the app, each with [token] and, when given, [installId]. */
  const reads = (token: string, installId?: string): request.Test[] =>
    [
      `/files/tree?${new URLSearchParams({ folder, path: '' }).toString()}`,
      `/files/content?${new URLSearchParams({ folder, path: 'src/a.ts' }).toString()}`,
      `/files/raw?${new URLSearchParams({ folder, path: 'src/a.ts' }).toString()}`,
      '/files/limits',
    ].map((route) => {
      const call = http().get(route).set('authorization', `Bearer ${token}`);
      return installId === undefined ? call : call.set('x-install-id', installId);
    });

  /** The statuses and codes of [calls], in order. */
  const outcomes = async (calls: request.Test[]): Promise<string[]> =>
    (await Promise.all(calls)).map((response) =>
      `${String(response.status)} ${String(response.body?.error?.code ?? '')}`.trim(),
    );

  /** Registers [installId] for the person behind [token], as the app does on every launch. */
  const register = async (token: string, installId = INSTALL): Promise<string> => {
    const response = await http()
      .post('/devices')
      .set('authorization', `Bearer ${token}`)
      .set('x-install-id', installId)
      .send({
        installId,
        name: 'Pixel 8',
        platform: 'android',
        appVersion: '1.0.0',
        locale: 'pt-BR',
      });
    expect(response.status).toBeLessThan(300);
    return String(response.body.id);
  };

  const approve = (deviceId: string): request.Test =>
    http().post(`/devices/${deviceId}/approval`).set('authorization', `Bearer ${web}`).send({});

  const revoke = (deviceId: string): request.Test =>
    http().delete(`/devices/${deviceId}/approval`).set('authorization', `Bearer ${web}`);

  const refused = (code: string): string[] => Array<string>(4).fill(`403 ${code}`);
  const read = ['200', '200', '200', '200'];

  it('the web reads and writes without a device, as it always has — S-148', async () => {
    expect(await outcomes(reads(web))).toEqual(read);

    const created = await http()
      .post('/files')
      .set('authorization', `Bearer ${web}`)
      .send({ folder, path: 'notes/web.md', kind: 'file', content: '# web\n' });
    expect(created.status).toBe(201);
  });

  it('a pending device is refused on every route — S-144', async () => {
    await register(app);

    expect(await outcomes(reads(app, INSTALL))).toEqual(refused('DEVICE_NOT_REGISTERED'));
  });

  it('approved in the browser, the next request already passes — S-149, S-143', async () => {
    const deviceId = await register(app);
    expect(await outcomes(reads(app, INSTALL))).toEqual(refused('DEVICE_NOT_REGISTERED'));

    expect((await approve(deviceId)).status).toBeLessThan(300);

    expect(await outcomes(reads(app, INSTALL))).toEqual(read);
  });

  it('leaving the header out does not get round the rule — S-145', async () => {
    await approve(await register(app));

    expect(await outcomes(reads(app))).toEqual(refused('DEVICE_NOT_REGISTERED'));
  });

  it('a token with no azp needs the device like the app — S-147', async () => {
    expect(await outcomes(reads(azpless))).toEqual(refused('DEVICE_NOT_REGISTERED'));

    await approve(await register(app));
    expect(await outcomes(reads(azpless, INSTALL))).toEqual(read);
  });

  it("another person's installation is not this person's device — S-146", async () => {
    await approve(await register(app));

    expect(await outcomes(reads(otherApp, INSTALL))).toEqual(refused('DEVICE_NOT_REGISTERED'));
  });

  it('revoked in the middle of reading, the next request is refused — S-150, S-146', async () => {
    const deviceId = await register(app);
    await approve(deviceId);
    expect(await outcomes(reads(app, INSTALL))).toEqual(read);

    expect((await revoke(deviceId)).status).toBeLessThan(300);

    expect(await outcomes(reads(app, INSTALL))).toEqual(refused('DEVICE_REVOKED'));
  });

  it('the app cannot write from a pending device either', async () => {
    await register(app);

    const created = await http()
      .post('/files')
      .set('authorization', `Bearer ${app}`)
      .set('x-install-id', INSTALL)
      .send({ folder, path: 'notes/app.md', kind: 'file', content: '# app\n' });
    expect(created.status).toBe(403);
    expect(created.body.error.code).toBe('DEVICE_NOT_REGISTERED');
  });
});
