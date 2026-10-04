import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * One realm reached through two origins, against the real application — ADR-021, plan 10 B-26.
 *
 * Two providers on localhost that sign with **the same key**, each answering its own discovery
 * with its own issuer: the provider's own port, and the web server that forwards `/realms` to it.
 * That is what the spike of B-25 measured on the real provider — `iss` follows the origin, the key
 * set does not. The backend lists both, and a third origin it does not list is somebody else.
 */
describe('the accepted issuers', () => {
  let database: DisposablePostgres;
  let direct: IdentityServer;
  let throughWeb: IdentityServer;
  let outsider: IdentityServer;
  let harness: TestApp;
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    direct = await startIdentityServer();
    throughWeb = await startIdentityServer();
    outsider = await startIdentityServer();
    harness = await startTestApp(database.url, direct, undefined, undefined, {
      OIDC_ADDITIONAL_ISSUERS: throughWeb.issuer,
    });
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await outsider.stop();
    await throughWeb.stop();
    await direct.stop();
    await database.stop();
  });

  beforeEach(() => {
    harness.log.lines.length = 0;
  });

  const devices = (token: string): request.Test =>
    request(harness.app.getHttpServer()).get('/devices').set('authorization', `Bearer ${token}`);

  /** A socket that has sent its handshake with a token, and the first frame it got back. */
  async function handshake(token: string): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);
    socket.send(
      commandFrame('connection.authenticate', {
        token,
        locale: 'en',
        client: { kind: 'mobile', version: '0.0.0' },
      }),
    );
    return socket;
  }

  describe('over HTTP', () => {
    // S-89, against the real wiring: each origin's discovery and key set read once, by its own cache.
    it('accepts a burst of tokens of both origins, reading each origin once (S-86, S-89)', async () => {
      const tokens = [await direct.accessToken(), await throughWeb.accessToken()];

      const answers = await Promise.all(
        Array.from({ length: 8 }, (_, index) => devices(tokens[index % 2] ?? '')),
      );

      expect(answers.map((answer) => answer.status)).toEqual(Array(8).fill(200));
      expect([direct.hits.discovery, direct.hits.certs]).toEqual([1, 1]);
      expect([throughWeb.hits.discovery, throughWeb.hits.certs]).toEqual([1, 1]);
    });

    it('answers a token of an origin outside the list with 401, and names the claim only in the log (S-87)', async () => {
      const response = await devices(await outsider.accessToken());

      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({
        code: 'UNAUTHENTICATED',
        messageKey: 'auth.error.unauthenticated',
      });
      expect(JSON.stringify(response.body)).not.toContain('iss');
      expect(harness.log.withOp('auth.verify')[0]?.['err']).toMatchObject({
        message: expect.stringContaining('"iss"'),
      });
      // Refused by the list, not by a fetch: nothing was asked of the origin nobody configured.
      expect(outsider.hits.discovery + outsider.hits.certs).toBe(0);
    });
  });

  describe('over the WebSocket', () => {
    it('opens the handshake with a token of either origin (S-86)', async () => {
      for (const token of [await direct.accessToken(), await throughWeb.accessToken()]) {
        const socket = await handshake(token);

        expect(await socket.next()).toMatchObject({ kind: 'ack', type: 'connection.ready' });
      }
    });

    it('renews the credential with a token of the other origin, the same user (S-86)', async () => {
      const socket = await handshake(await throughWeb.accessToken());
      expect(await socket.next()).toMatchObject({ kind: 'ack', type: 'connection.ready' });

      socket.send(commandFrame('connection.reauthenticate', { token: await direct.accessToken() }));

      expect(await socket.next()).toMatchObject({
        kind: 'ack',
        type: 'command.accepted',
        payload: { command: 'connection.reauthenticate' },
      });
      expect(socket.isOpen).toBe(true);
    });

    it('closes the handshake of an origin outside the list with 4401 (S-87)', async () => {
      const socket = await handshake(await outsider.accessToken());

      await expect(socket.closed()).resolves.toMatchObject({ code: 4401 });
    });

    it('closes a socket renewed with a token of an origin outside the list with 4401 (S-87)', async () => {
      const socket = await handshake(await direct.accessToken());
      expect(await socket.next()).toMatchObject({ kind: 'ack', type: 'connection.ready' });

      socket.send(
        commandFrame('connection.reauthenticate', { token: await outsider.accessToken() }),
      );

      await expect(socket.closed()).resolves.toMatchObject({ code: 4401 });
    });
  });
});
