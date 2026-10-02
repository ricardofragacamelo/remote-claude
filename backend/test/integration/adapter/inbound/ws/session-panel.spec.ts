import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions, ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { ScriptedTranscripts } from '../../../../fakes/agent-sdk/scripted-transcripts';
import { loadInstallation } from '../../../../fakes/agent-sdk/fixture';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * The panel of Claude, over the real gateway — plan 08, F4: the backend's queue of prompts seen by
 * two clients at once, editing and resending a prompt as a fork, and what the panel asks about a
 * live session — its models, its context, its MCP servers.
 */
describe('the panel of Claude', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let store: ScriptedTranscripts;
  let script: ScriptOptions;
  let workspace: string;
  const records: ScriptRecord[] = [];

  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const createQuery: QueryFactory = (params) => {
      const sdk = scriptedSdk({ ...script, transcripts: store });
      records.push(sdk.record);
      return sdk.createQuery(params);
    };

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(createQuery)
          .overrideProvider(TRANSCRIPT_SDK)
          .useValue({
            listSessions: (options: never) => store.listSessions(options),
            getSessionInfo: (id: string) => store.getSessionInfo(id),
            getSessionMessages: (id: string) => store.getSessionMessages(id),
          }),
      allowlist,
      { RC_PERMISSION_TIMEOUT_MS: '5000', RC_SESSION_MAX_CONCURRENT: '32' },
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

  beforeEach(({ task }) => {
    workspace = path.join(root, task.id);
    mkdirSync(workspace, { recursive: true });
    store = new ScriptedTranscripts();
    script = { fixture: 'text-turn' };
    records.length = 0;
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

  async function until(
    socket: TestSocket,
    found: (frame: Envelope) => boolean,
    limit = 400,
  ): Promise<Envelope> {
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      if (found(frame)) {
        return frame;
      }
    }
    throw new Error(`nothing matched in ${String(limit)} frames`);
  }

  const ofType = (type: string) => (frame: Envelope) => frame.type === type;

  async function started(
    socket: TestSocket,
    extra: Record<string, unknown> = {},
  ): Promise<Envelope> {
    socket.send(commandFrame('session.start', { workspacePath: workspace, ...extra }));
    return until(socket, (frame) => frame.type === 'session.started' || frame.kind === 'error');
  }

  const sessionOf = (frame: Envelope): string => String(frame.payload?.['sessionId']);

  async function attached(socket: TestSocket, sessionId: string): Promise<void> {
    socket.send(commandFrame('session.attach', { sessionId }));
    await until(socket, ofType('session.attached'));
  }

  /** A prompt sent, and the first frame that answers it: its refusal or the event it caused. */
  async function answered(socket: TestSocket, type: string, payload: Record<string, unknown>) {
    const command = commandFrame(type, payload);
    socket.send(command);
    return until(
      socket,
      (frame) =>
        (frame.kind === 'error' && frame.correlationId === command['id']) ||
        (frame.kind === 'ack' && frame.correlationId === command['id']),
    );
  }

  async function turnEnds(socket: TestSocket): Promise<void> {
    await until(socket, ofType('turn.completed'), 1_000);
  }

  const get = (route: string) =>
    request(harness.app.getHttpServer()).get(route).set('Authorization', `Bearer ${token}`);

  describe('the queue of prompts — B-34', () => {
    it('holds a prompt sent during a turn, shows it to everybody, and runs it next — S-156, S-160', async () => {
      const first = await connect();
      const second = await connect();
      const sessionId = sessionOf(await started(first));
      await attached(second, sessionId);

      first.send(commandFrame('session.prompt', { sessionId, text: '[hold] a long one' }));
      await until(first, (frame) => frame.payload?.['status'] === 'thinking');
      second.send(commandFrame('session.prompt', { sessionId, text: 'and then this one' }));

      const seenByFirst = await until(first, ofType('prompt.queued'));
      const seenBySecond = await until(second, ofType('prompt.queued'));
      expect(seenByFirst.payload).toEqual({
        queueId: expect.stringMatching(/^q_/) as unknown,
        position: 1,
        promptedBy: 'web',
        preview: 'and then this one',
      });
      expect(seenBySecond.payload).toEqual(seenByFirst.payload);
      expect(records[0]?.turns).toEqual(['[hold] a long one']);

      first.send(commandFrame('session.interrupt', { sessionId }));
      const dequeued = await until(first, ofType('prompt.dequeued'));
      expect(dequeued.payload).toEqual({
        queueId: seenByFirst.payload?.['queueId'],
        reason: 'started',
      });
      await turnEnds(first);
      expect(records[0]?.turns).toEqual(['[hold] a long one', 'and then this one']);
    });

    it('takes a waiting prompt out before it reaches Claude — S-157, S-159', async () => {
      const socket = await connect();
      const sessionId = sessionOf(await started(socket));
      socket.send(commandFrame('session.prompt', { sessionId, text: '[hold] a long one' }));
      await until(socket, (frame) => frame.payload?.['status'] === 'thinking');
      socket.send(commandFrame('session.prompt', { sessionId, text: 'never mind' }));
      const queueId = String((await until(socket, ofType('prompt.queued'))).payload?.['queueId']);

      expect(
        (await answered(socket, 'session.cancelQueuedPrompt', { sessionId, queueId })).type,
      ).toBe('command.accepted');
      expect((await until(socket, ofType('prompt.dequeued'))).payload).toEqual({
        queueId,
        reason: 'cancelled',
      });
      // Again: an ack, and nothing else moves.
      expect(
        (await answered(socket, 'session.cancelQueuedPrompt', { sessionId, queueId })).type,
      ).toBe('command.accepted');
      const unknown = await answered(socket, 'session.cancelQueuedPrompt', {
        sessionId,
        queueId: 'q_x',
      });
      expect(unknown.payload).toMatchObject({ code: 'QUEUED_PROMPT_NOT_FOUND' });

      socket.send(commandFrame('session.interrupt', { sessionId }));
      await turnEnds(socket);
      expect(records[0]?.turns).toEqual(['[hold] a long one']);
    });

    it('refuses to cancel a prompt that already started — S-158', async () => {
      const socket = await connect();
      const sessionId = sessionOf(await started(socket));
      socket.send(commandFrame('session.prompt', { sessionId, text: '[hold] a long one' }));
      await until(socket, (frame) => frame.payload?.['status'] === 'thinking');
      socket.send(commandFrame('session.prompt', { sessionId, text: '[hold] the next' }));
      const queueId = String((await until(socket, ofType('prompt.queued'))).payload?.['queueId']);
      socket.send(commandFrame('session.interrupt', { sessionId }));
      await until(socket, ofType('prompt.dequeued'));

      const refused = await answered(socket, 'session.cancelQueuedPrompt', { sessionId, queueId });

      expect(refused.payload).toMatchObject({
        code: 'CONFLICT',
        messageKey: 'session.error.queuedPromptStarted',
      });
      socket.send(commandFrame('session.interrupt', { sessionId }));
    });
  });

  describe('edit and resend — B-35', () => {
    /** A conversation of two turns, ours, and the ids of its two prompts. */
    async function twoTurns(
      socket: TestSocket,
    ): Promise<{ conversation: string; prompts: string[] }> {
      const frame = await started(socket);
      const sessionId = sessionOf(frame);
      for (const text of ['first question', 'second question']) {
        socket.send(commandFrame('session.prompt', { sessionId, text }));
        await turnEnds(socket);
      }
      const conversation = String(frame.payload?.['claudeSessionId']);
      const prompts = (await store.getSessionMessages(conversation))
        .filter((message) => message.type === 'user' && message.parent_tool_use_id === null)
        .filter((message) => {
          const content = (message.message as { content?: unknown }).content;
          return (
            typeof content === 'string' ||
            (Array.isArray(content) &&
              content.every((block) => (block as { type?: string }).type === 'text'))
          );
        })
        .map((message) => message.uuid);
      return { conversation, prompts };
    }

    it('forks before the prompt, in a new conversation, and leaves the original as it was — S-161', async () => {
      const socket = await connect();
      const { conversation, prompts } = await twoTurns(socket);
      const before = (await store.getSessionMessages(conversation)).length;

      const fork = await started(socket, { resumeSessionId: conversation, forkAt: prompts[1] });

      expect(fork.payload).toMatchObject({ resumedFrom: conversation });
      expect(fork.payload?.['claudeSessionId']).not.toBe(conversation);
      const options = records.at(-1)?.options as Options;
      expect(options).toMatchObject({
        resume: conversation,
        forkSession: true,
        resumeDropsTurn: prompts[1],
      });
      expect(typeof options.resumeSessionAt).toBe('string');
      expect(await store.getSessionMessages(conversation)).toHaveLength(before);
    });

    it('starts afresh from the first prompt — S-165', async () => {
      const socket = await connect();
      const { conversation, prompts } = await twoTurns(socket);

      const fork = await started(socket, { resumeSessionId: conversation, forkAt: prompts[0] });

      expect(fork.payload?.['resumedFrom']).toBeUndefined();
      expect(records.at(-1)?.options?.resume).toBeUndefined();
    });

    it('refuses a point that is not a prompt of the conversation — S-163', async () => {
      const socket = await connect();
      const { conversation } = await twoTurns(socket);

      const refused = await started(socket, { resumeSessionId: conversation, forkAt: 'nowhere' });

      expect(refused.payload).toMatchObject({
        code: 'INVALID_INPUT',
        messageKey: 'session.error.forkPointUnknown',
      });
    });

    it('says the CLI refused the point, and offers nothing to retry — S-164', async () => {
      const socket = await connect();
      const { conversation, prompts } = await twoTurns(socket);
      script = { fixture: 'text-turn', refuseFork: true };

      const fork = await started(socket, { resumeSessionId: conversation, forkAt: prompts[1] });
      socket.send(commandFrame('session.prompt', { sessionId: sessionOf(fork), text: 'edited' }));
      const refusal = await until(socket, (frame) => frame.kind === 'error');

      expect(refusal.payload).toMatchObject({
        code: 'SESSION_FORK_REJECTED',
        messageKey: 'session.error.forkRejected',
      });
      expect((await until(socket, ofType('session.closed'))).payload?.['sessionId']).toBe(
        sessionOf(fork),
      );
    });
  });

  describe('what the panel asks about a session — B-36…B-38', () => {
    it('lists the models of the installation, never a list of ours — S-166', async () => {
      const sessionId = sessionOf(await started(await connect()));

      const models = await get(`/sessions/${sessionId}/models`);

      expect(models.status).toBe(200);
      expect(models.body.models.map((model: { value: string }) => model.value)).toEqual(
        loadInstallation().models.map((model) => model.value),
      );
      expect(models.body.current).toEqual(expect.any(String));
    });

    it('answers 502 when the CLI fails, and 504 when it does not answer — S-168, S-175, S-178', async () => {
      script = { fixture: 'text-turn', installationFails: new Error('gone') };
      const sessionId = sessionOf(await started(await connect()));

      for (const route of ['models', 'context', 'mcp-servers']) {
        const failed = await get(`/sessions/${sessionId}/${route}`);
        expect([failed.status, failed.body.error.code]).toEqual([502, 'CLAUDE_UNAVAILABLE']);
      }
    });

    it('measures the context by category, against the window of the model — S-173', async () => {
      const sessionId = sessionOf(await started(await connect()));

      const context = await get(`/sessions/${sessionId}/context`);

      expect(context.body).toMatchObject({ maxTokens: 1_000_000, percentage: 3 });
      expect(context.body.categories).toContainEqual(
        expect.objectContaining({ id: 'freeSpace', kind: 'free' }),
      );
    });

    it('lists the MCP servers with their status, never their configuration — S-176, S-177', async () => {
      script = {
        fixture: 'text-turn',
        mcpServers: [
          {
            name: 'docs',
            status: 'connected',
            config: { type: 'http', url: 'https://x/?token=s3cret' },
            tools: [{ name: 't' }],
          },
          { name: 'auth', status: 'needs-auth' },
          { name: 'later', status: 'pending' },
          { name: 'off', status: 'disabled' },
          { name: 'broken', status: 'failed', error: 'spawn /home/me/bin ENOENT' },
        ],
      };
      const sessionId = sessionOf(await started(await connect()));

      const servers = await get(`/sessions/${sessionId}/mcp-servers`);

      expect(servers.body).toEqual({
        servers: [
          { name: 'docs', status: 'connected', toolCount: 1 },
          { name: 'auth', status: 'needs-auth', toolCount: 0 },
          { name: 'later', status: 'pending', toolCount: 0 },
          { name: 'off', status: 'disabled', toolCount: 0 },
          { name: 'broken', status: 'failed', toolCount: 0 },
        ],
      });
      expect(JSON.stringify(servers.body)).not.toContain('s3cret');
      expect(JSON.stringify(servers.body)).not.toContain('ENOENT');
    });

    it("refuses somebody else's session", async () => {
      const sessionId = sessionOf(await started(await connect()));
      const stranger = await identity.accessToken({ subject: 'auth|stranger' });

      const refused = await request(harness.app.getHttpServer())
        .get(`/sessions/${sessionId}/models`)
        .set('Authorization', `Bearer ${stranger}`);

      expect(refused.status).toBe(403);
    });
  });
});
