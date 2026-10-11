import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { EngineRegistry } from '@application/session';
import type { AgentEnginePort } from '@application/session';
import { APP_CONFIG } from '@infra/config/environment';
import type { AppConfig } from '@infra/config/environment';
import { engineRegistryOf } from '@infra/modules/engines';
import { CLAUDE_SESSION_ENGINE } from '@infra/modules/engines/claude.providers';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { StubEngine } from '../../../../support/fakes/stub-engine';

/**
 * An engine registered whose adapter cannot prove that its own approvals are off — plan 28, B-35,
 * S-102. It is registered beside Claude through the composition's own function, over the real app:
 * the boot goes on, the engine is listed `unavailable` with the reason, no session opens on it, and
 * Claude opens one as always.
 */
describe('an engine that fails its security assertion', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  let token: string;
  const unsafe = new StubEngine('test-engine', '3.0.0');
  unsafe.security = {
    configFiles: ['.test-engine/config.json'],
    assert: () => ({ holds: false, unmet: ['noSelfApproval'] }),
  };
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    const scripted = scriptedSdk({ fixture: 'text-turn' });
    record = scripted.record;
    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(scripted.createQuery)
          .overrideProvider(EngineRegistry)
          .useFactory({
            inject: [APP_CONFIG, LOGGER, CLAUDE_SESSION_ENGINE],
            factory: (config: AppConfig, logger: Logger, claude: AgentEnginePort) =>
              engineRegistryOf([claude, unsafe], config.engines, logger),
          }),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await identity.stop();
    await database.stop();
  });

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

  async function firstOf(socket: TestSocket, types: readonly string[]): Promise<Envelope> {
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();
      if (types.includes(frame.type)) {
        return frame;
      }
    }
    throw new Error(`none of ${types.join(', ')}`);
  }

  const start = async (engine?: string): Promise<Envelope> => {
    const socket = await connect();
    socket.send(
      commandFrame('session.start', {
        workspacePath: root,
        ...(engine === undefined ? {} : { engine }),
      }),
    );
    return firstOf(socket, ['session.started', 'error']);
  };

  it('boots, and says at warn which engine failed and which clause', () => {
    expect(harness.log.withOp('engine.security.assert')).toEqual([
      expect.objectContaining({ level: 'warn', engine: 'test-engine', unmet: ['noSelfApproval'] }),
    ]);
  });

  it('lists it unavailable with the reason, and Claude available beside it', async () => {
    const response = await request(harness.url)
      .get('/engines')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      defaultEngine: 'claude',
      engines: [
        { id: 'claude', state: 'available', reason: null },
        {
          id: 'test-engine',
          state: 'unavailable',
          reason: 'engine.error.securityUnmet',
          version: '3.0.0',
        },
      ],
    });
  });

  it('opens no session on it, and spawns nothing', async () => {
    const refused = await start('test-engine');

    expect(refused.kind).toBe('error');
    expect(refused.payload).toMatchObject({
      code: 'AGENT_UNAVAILABLE',
      params: { engine: 'test-engine' },
    });
    expect(unsafe.starts).toEqual([]);
  });

  it('still opens a session on Claude', async () => {
    const started = await start();

    expect(started.type).toBe('session.started');
    expect(record.options?.settingSources).toEqual(['project']);
  });
});
