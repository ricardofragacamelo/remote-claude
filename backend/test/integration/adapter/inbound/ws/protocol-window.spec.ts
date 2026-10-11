import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { AgentWrites } from '@application/files';
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
 * The window of the previous protocol, over a real socket (plan 28, B-12, D-08): a client of the
 * current version and one of the version before it, on the same session, each read the frames in
 * the shape they speak — and a command of the previous shape is still understood.
 */
describe('the window of the previous protocol', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let record: ScriptRecord;
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

  async function connect(version: number): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url, version);
    open.push(socket);
    socket.send(
      commandFrame(
        'connection.authenticate',
        { token, locale: 'en', client: { kind: 'web', version: '0.0.0' } },
        { v: version as never },
      ),
    );
    const ready = await socket.next();
    expect(ready).toMatchObject({ type: 'connection.ready', v: version });
    return socket;
  }

  async function until(socket: TestSocket, type: string): Promise<Envelope> {
    for (let taken = 0; taken < 200; taken += 1) {
      const frame = await socket.next();
      if (frame.type === type) {
        return frame;
      }
    }
    throw new Error(`no ${type}`);
  }

  it('names the conversation of a new session with its engine and capabilities in the current version — S-36', async () => {
    const current = await connect(2);
    current.send(commandFrame('session.start', { workspacePath: root }));

    const started = await until(current, 'session.started');

    expect(started.v).toBe(2);
    expect(started.payload).toMatchObject({
      engine: 'claude',
      conversation: { engine: 'claude', id: expect.any(String) },
      capabilities: { fork: 'atMessage', resume: true },
    });
    expect(started.payload).not.toHaveProperty('claudeSessionId');
  });

  it('gives the previous version its own shape, and understands its commands — S-36', async () => {
    const previous = await connect(1);
    previous.send(commandFrame('session.start', { workspacePath: root }, { v: 1 as never }));

    const started = await until(previous, 'session.started');

    expect(started.v).toBe(1);
    expect(started.payload).toMatchObject({ claudeSessionId: expect.any(String) });
    expect(started.payload).not.toHaveProperty('conversation');
    expect(started.payload).not.toHaveProperty('capabilities');
  });

  it('answers each of two clients on one session in the version it speaks — S-37', async () => {
    const current = await connect(2);
    current.send(commandFrame('session.start', { workspacePath: root }));
    const started = await until(current, 'session.started');
    const sessionId = String(started.payload?.['sessionId']);
    const conversation = started.payload?.['conversation'] as { engine: string; id: string };

    const previous = await connect(1);
    previous.send(commandFrame('session.attach', { sessionId }, { v: 1 as never }));
    const attachedPrevious = await until(previous, 'session.attached');
    current.send(commandFrame('session.attach', { sessionId }));
    const attachedCurrent = await until(current, 'session.attached');

    expect(attachedPrevious.payload).toMatchObject({ claudeSessionId: conversation.id });
    expect(attachedPrevious.payload).not.toHaveProperty('conversation');
    expect(attachedCurrent.payload).toMatchObject({ conversation });
    expect(attachedCurrent.payload).not.toHaveProperty('claudeSessionId');
  });

  it('names a write of the agent `agent` with its engine for the current version, and `claude` for the previous — S-73', async () => {
    const folder = path.join(root, `window-${String(Date.now())}`);
    mkdirSync(folder);
    const current = await connect(2);
    const previous = await connect(1);
    const watching = async (socket: TestSocket, v: number): Promise<string> => {
      socket.send(commandFrame('workspace.watch', { workspacePath: folder }, { v: v as never }));
      return String((await until(socket, 'workspace.watching')).payload?.['watchId']);
    };
    await watching(current, 2);
    await watching(previous, 1);
    const content = 'written by the agent\n';

    harness.app.get(AgentWrites).record({
      path: path.join(folder, 'agent.txt'),
      hash: createHash('sha256').update(content).digest('hex'),
      at: new Date(),
      engine: 'claude',
    });
    writeFileSync(path.join(folder, 'agent.txt'), content);

    const [now, before] = await Promise.all([
      until(current, 'workspace.filesChanged'),
      until(previous, 'workspace.filesChanged'),
    ]);

    expect(now.v).toBe(2);
    expect(now.payload?.['changes']).toEqual([
      { path: 'agent.txt', kind: 'created', origin: 'agent', engine: 'claude' },
    ]);
    expect(before.v).toBe(1);
    expect(before.payload?.['changes']).toEqual([
      { path: 'agent.txt', kind: 'created', origin: 'claude' },
    ]);
  });

  describe('the modes, both ways — plan 28, S-79', () => {
    /** The mode the core holds a session in, as the list of live sessions says it — canonical. */
    async function modeOf(sessionId: string): Promise<unknown> {
      const response = await request(harness.app.getHttpServer())
        .get('/sessions')
        .query({ workspacePath: root })
        .set('authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      const rows = (response.body as { sessions: { sessionId: string; permissionMode: string }[] })
        .sessions;
      return rows.find((row) => row.sessionId === sessionId)?.permissionMode;
    }

    /** The refusal of a `session.start` asking for [permissionMode], on a connection of [version]. */
    async function startRefused(version: number, permissionMode: string): Promise<Envelope> {
      const socket = await connect(version);
      socket.send(
        commandFrame(
          'session.start',
          { workspacePath: root, permissionMode },
          { v: version as never },
        ),
      );
      return until(socket, 'error');
    }

    it.each([2, 1])(
      'refuses `bypassPermissions` on a connection of version %i',
      async (version) => {
        const refused = await startRefused(version, 'bypassPermissions');

        expect(refused.v).toBe(version);
        expect(refused.payload).toMatchObject({ code: 'INVALID_INPUT' });
      },
    );

    it.each(['default', 'plan'])(
      'refuses the old name %s on a connection of the current version',
      async (permissionMode) => {
        expect((await startRefused(2, permissionMode)).payload).toMatchObject({
          code: 'INVALID_INPUT',
        });
      },
    );

    it.each([
      ['default', 'ask', 'default'],
      ['plan', 'readOnly', 'plan'],
      ['acceptEdits', 'acceptEdits', 'acceptEdits'],
    ])(
      'opens a session the previous version asks %s for in %s, and tells it %s back',
      async (asked, canonical, sdk) => {
        const previous = await connect(1);
        previous.send(
          commandFrame(
            'session.start',
            { workspacePath: root, permissionMode: asked },
            { v: 1 as never },
          ),
        );
        const started = await until(previous, 'session.started');
        const sessionId = String(started.payload?.['sessionId']);

        expect(started.payload).toMatchObject({ permissionMode: asked });
        expect(record.options?.permissionMode).toBe(sdk);

        expect(await modeOf(sessionId)).toBe(canonical);
      },
    );

    it('reads a switch of the previous version to `plan` as read-only', async () => {
      const previous = await connect(1);
      previous.send(commandFrame('session.start', { workspacePath: root }, { v: 1 as never }));
      const sessionId = String((await until(previous, 'session.started')).payload?.['sessionId']);

      previous.send(
        commandFrame('session.setPermissionMode', { sessionId, mode: 'plan' }, { v: 1 as never }),
      );
      expect((await until(previous, 'command.accepted')).payload).toMatchObject({
        command: 'session.setPermissionMode',
      });
      expect(record.modes.at(-1)).toBe('plan');

      expect(await modeOf(sessionId)).toBe('readOnly');
    });

    it('refuses a switch of the previous version to `bypassPermissions`', async () => {
      const previous = await connect(1);
      previous.send(commandFrame('session.start', { workspacePath: root }, { v: 1 as never }));
      const sessionId = String((await until(previous, 'session.started')).payload?.['sessionId']);

      previous.send(
        commandFrame(
          'session.setPermissionMode',
          { sessionId, mode: 'bypassPermissions' },
          { v: 1 as never },
        ),
      );

      expect((await until(previous, 'error')).payload).toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('the usage of a turn, in each version — plan 28, S-85', () => {
    it('counts in canonical names for the current version, and in the API`s for the previous', async () => {
      const current = await connect(2);
      current.send(commandFrame('session.start', { workspacePath: root }));
      const sessionId = String((await until(current, 'session.started')).payload?.['sessionId']);
      const previous = await connect(1);
      previous.send(commandFrame('session.attach', { sessionId }, { v: 1 as never }));
      await until(previous, 'session.attached');

      current.send(commandFrame('session.prompt', { sessionId, text: 'hello' }));
      const [now, before] = await Promise.all([
        until(current, 'turn.completed'),
        until(previous, 'turn.completed'),
      ]);

      const usage = now.payload?.['usage'] as Record<string, unknown>;
      expect(Object.keys(usage).length).toBeGreaterThan(0);
      expect(
        Object.keys(usage).every((name) =>
          [
            'inputTokens',
            'outputTokens',
            'cacheReadTokens',
            'cacheWriteTokens',
            'webSearches',
          ].includes(name),
        ),
      ).toBe(true);
      expect(before.payload?.['usage']).toEqual(
        Object.fromEntries(
          Object.entries({
            input_tokens: usage['inputTokens'],
            output_tokens: usage['outputTokens'],
            cache_read_input_tokens: usage['cacheReadTokens'],
            cache_creation_input_tokens: usage['cacheWriteTokens'],
          }).filter(([, value]) => value !== undefined),
        ),
      );
    });
  });
});
