import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { AgentSdkClaudeSessionAdapter } from '@adapter/outbound/engines/claude/agent-sdk.adapter';
import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import type { EngineCapabilities } from '@domain/engine';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * The effort levels an engine announces, over the real socket — plan 28, B-28 / S-84.
 *
 * Claude Code announces all five; here the adapter of the running app is made to announce fewer, as
 * another engine would, and a `session.start` asking for one it lacks is refused before anything is
 * spawned.
 */
describe('the effort levels of the engine', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let record: ScriptRecord;
  let root: string;
  let announced: EngineCapabilities;
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
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
    announced = harness.app.get(AgentSdkClaudeSessionAdapter).capabilities;
  });

  afterEach(() => {
    announce(announced);
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  /** Makes the adapter of the running app announce [capabilities]. */
  function announce(capabilities: EngineCapabilities): void {
    Object.defineProperty(harness.app.get(AgentSdkClaudeSessionAdapter), 'capabilities', {
      value: capabilities,
      configurable: true,
    });
  }

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

  async function firstOf(socket: TestSocket, types: readonly string[]): Promise<Envelope> {
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();
      if (types.includes(frame.type)) {
        return frame;
      }
    }
    throw new Error(`none of ${types.join(', ')}`);
  }

  const start = async (effort: string): Promise<Envelope> => {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root, effort }));
    return firstOf(socket, ['session.started', 'error']);
  };

  it('refuses a level the engine does not announce, and spawns nothing', async () => {
    announce({ ...announced, effortLevels: ['low', 'medium'] });
    const before = record.options;

    const refused = await start('max');

    expect(refused.kind).toBe('error');
    expect(refused.payload).toMatchObject({
      code: 'INVALID_INPUT',
      messageKey: 'session.error.effortUnsupported',
      params: { level: 'max' },
    });
    expect(record.options).toBe(before);
  });

  it('refuses every level of an engine with no effort at all', async () => {
    announce({ ...announced, effortLevels: [] });

    expect((await start('low')).payload).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('opens with a level the engine announces', async () => {
    announce({ ...announced, effortLevels: ['low', 'medium'] });

    const started = await start('medium');

    expect(started.type).toBe('session.started');
    expect(record.options).toMatchObject({ effort: 'medium' });
  });
});
