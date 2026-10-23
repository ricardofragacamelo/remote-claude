import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import {
  createGitMarketplaceFixture,
  marketplaceManifestJson,
  pluginManifestJson,
} from '../../../../support/fixtures/git-marketplace-fixture';
import type { GitMarketplaceFixture } from '../../../../support/fixtures/git-marketplace-fixture';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { waitFor } from '../../../../support/app/wait-for';

/**
 * A session loads the directory of an **installed marketplace** plugin exactly like a local one
 * (plan 13, B-47; S-200) — `ClaudePluginSessionExtensionPaths` does not distinguish the two once a
 * row is enabled. What is specific to a marketplace plugin is the other half: it stops composing
 * into a **new** session the moment its own marketplace leaves the allowlist file (S-213) — proved
 * here with a real `SIGHUP` to this very process, the same mechanism
 * `allowlist-reload-signal.spec.ts` already proves in isolation, now wired through to composition.
 */
describe('a session loads a marketplace plugin — plan 13, B-47', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  let allowlistFile: string;
  let token: string;
  let fixture: GitMarketplaceFixture;
  const sockets: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    fixture = createGitMarketplaceFixture();
    fixture.commit({
      '.claude-plugin/marketplace.json': marketplaceManifestJson('acme', [
        { name: 'my-plugin', source: 'plugins/my-plugin' },
      ]),
      'plugins/my-plugin/.claude-plugin/plugin.json': pluginManifestJson('my-plugin'),
    });

    const allowlist = writeTestAllowlist([SUBJECT], [{ name: 'acme', url: fixture.url }]);
    root = allowlist.root;
    allowlistFile = allowlist.file;
    mkdirSync(path.join(root, 'repo'), { recursive: true });

    const scripted = scriptedSdk({ fixture: 'text-turn', silent: true });
    record = scripted.record;
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterEach(async () => {
    for (const { socket, sessionId } of started.splice(0)) {
      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed').catch(() => undefined);
    }
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  async function connect(): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    sockets.push(socket);
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

  async function until(socket: TestSocket, type: string): Promise<Envelope> {
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();
      if (frame.type === type) return frame;
      if (frame.type === 'error') throw new Error(JSON.stringify(frame.payload));
    }
    throw new Error(`no ${type}`);
  }

  async function open(): Promise<Envelope> {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: path.join(root, 'repo') }));
    const opened = await until(socket, 'session.started');
    started.push({ socket, sessionId: String(opened.payload?.['sessionId']) });
    return opened;
  }

  const post = (route: string, body: object) =>
    request(harness.app.getHttpServer())
      .post(route)
      .set('authorization', `Bearer ${token}`)
      .send(body);

  function declareRoots(marketplaces: readonly { name: string; url: string }[]): void {
    const marketplacesSection =
      marketplaces.length === 0
        ? ''
        : `marketplaces:\n${marketplaces
            .map((m) => `  - name: ${m.name}\n    source: { type: git, url: ${m.url} }\n`)
            .join('')}`;
    writeFileSync(
      allowlistFile,
      `roots:\n  - path: ${root}\n    label: Suite\n    users:\n      - ${SUBJECT}\n${marketplacesSection}`,
      'utf8',
    );
  }

  it('installs from the declared marketplace and composes the plugin into a new session — S-200', async () => {
    const installed = await post('/engines/claude/plugins/marketplace', {
      marketplace: 'acme',
      plugin: 'my-plugin',
    });
    expect(installed.status).toBe(201);
    expect(installed.body.origin).toBe('marketplace');

    await open();

    expect(record.options?.plugins).toEqual([
      { type: 'local', path: installed.body.path, skipMcpDiscovery: true },
    ]);
  });

  it('stops composing the plugin into a new session once its marketplace leaves the file, by a real SIGHUP — S-213', async () => {
    const installed = await post('/engines/claude/plugins/marketplace', {
      marketplace: 'acme',
      plugin: 'my-plugin',
    });
    expect(installed.status).toBe(201);

    declareRoots([]); // the marketplace section is gone — the same edit `pnpm allowlist` would make
    process.kill(process.pid, 'SIGHUP');

    await waitFor(
      'the allowlist reload to be logged',
      () => Promise.resolve(harness.log.lines),
      (lines) => lines.some((line) => line['op'] === 'allowlist.reloaded'),
      15_000,
    );

    await open();

    expect('plugins' in (record.options ?? {})).toBe(false);

    // Restore the marketplace for any later test in this file.
    declareRoots([{ name: 'acme', url: fixture.url }]);
    process.kill(process.pid, 'SIGHUP');
    await waitFor(
      'the allowlist reload to be logged again',
      () =>
        Promise.resolve(harness.log.lines.filter((line) => line['op'] === 'allowlist.reloaded')),
      (lines) => lines.length >= 2,
      15_000,
    );
  });
});
