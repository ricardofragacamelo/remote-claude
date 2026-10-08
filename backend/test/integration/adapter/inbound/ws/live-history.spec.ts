import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Envelope } from '@remote-claude/contracts';
import type { Router } from 'express';

import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import {
  TRANSCRIPT_LIMITS,
  TRANSCRIPT_READ_LIMITS,
} from '@adapter/outbound/claude/transcript-reads';
import { SESSION_ORIGIN_REPOSITORY } from '@application/session';
import type { SessionOriginRepository } from '@application/session';
import { FollowTranscriptUseCase } from '@application/transcript';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import {
  capturedTranscript,
  recordedHistory,
  ScriptedTranscripts,
} from '../../../../fakes/agent-sdk/scripted-transcripts';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import type { TestAllowlist, TestApp } from '../../../../support/app/test-app';
import { waitFor } from '../../../../support/app/wait-for';
import { conversationId } from '../../../../support/builders/transcript.builder';
import { conversationsElsewhere, ELSEWHERE_PATH } from '../../../../e2e/conversations-elsewhere';

const OTHER = 'auth|other';
const MIB = 1_048_576;

/** One root of the suite's subject. */
function oneRootAllowlist(): TestAllowlist {
  const directory = mkdtempSync(path.join(tmpdir(), 'rc-live-history-'));
  const root = path.join(directory, 'mine');
  const file = path.join(directory, 'allowlist.yaml');

  mkdirSync(root);
  writeFileSync(
    file,
    `roots:\n  - path: ${root}\n    label: Mine\n    users:\n      - ${SUBJECT}\n      - ${OTHER}\n`,
    'utf8',
  );

  return { file, root };
}

/** The id of the tool a recording ran first, as its history names it. */
function firstToolOf(history: readonly SessionMessage[]): string {
  for (const entry of history) {
    const content = (entry.message as { content?: unknown }).content;
    const tool = Array.isArray(content)
      ? (content as { type: string; id?: string }[]).find((block) => block.type === 'tool_use')
      : undefined;
    if (tool?.id !== undefined) {
      return tool.id;
    }
  }
  throw new Error('the recording ran no tool');
}

/** The recorded prompt with an image, its image's type and bytes changed — the rest as the SDK read it. */
function imagePrompt(mediaType: string, data: string): SessionMessage[] {
  return recordedHistory('image-turn').map((entry) => {
    const content = (entry.message as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return entry;
    }
    return {
      ...entry,
      message: {
        ...(entry.message as object),
        content: (content as Record<string, unknown>[]).map((block) =>
          block['type'] === 'image'
            ? { ...block, source: { type: 'base64', media_type: mediaType, data } }
            : block,
        ),
      },
    } as SessionMessage;
  });
}

/**
 * Plan 22 against the real application: the page that says where it ends, the two routes that serve
 * on demand, and `transcript.follow` over a real socket — the guard, the pipes, the filter, the use
 * cases, the adapter with its caches, the gateway and PostgreSQL. Only Claude's store is scripted, and
 * what it holds was read back of real runs.
 */
describe('the history read live — plan 22', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let allowlist: TestAllowlist;
  let store: ScriptedTranscripts;
  /** The door of the e2e entry point into the store of each test (B-34). */
  let door: Router;
  let token: string;
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    allowlist = oneRootAllowlist();

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(TRANSCRIPT_SDK)
          .useValue({
            listSessions: (options: never) => store.listSessions(options),
            getSessionInfo: (id: string) => store.getSessionInfo(id),
            getSessionMessages: (id: string) => store.getSessionMessages(id),
            listSubagents: (id: string) => store.listSubagents(id),
            getSubagentMessages: (id: string, agent: string) =>
              store.getSubagentMessages(id, agent),
          })
          .overrideProvider(TRANSCRIPT_LIMITS)
          .useValue({ ...TRANSCRIPT_READ_LIMITS, wholeStoreTtlMs: 0 })
          .overrideProvider(QUERY_FACTORY)
          .useValue(((params) =>
            scriptedSdk({ silent: true }).createQuery(params)) as QueryFactory),
      allowlist,
      {},
      // Mounted as `scripted-main.ts` mounts it, in front of the store of whichever test runs.
      (app) =>
        app.use(ELSEWHERE_PATH, (request: never, response: never, next: never) => {
          door(request, response, next);
        }),
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    store = new ScriptedTranscripts();
    door = conversationsElsewhere(store);
    const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
    await db.execute(sql`TRUNCATE TABLE "session_origins"`);
  });

  afterEach(async () => {
    for (const socket of open.splice(0)) {
      socket.close();
    }
    await waitFor(
      'subscriptions to settle',
      () => Promise.resolve(harness.app.get(FollowTranscriptUseCase).subscriptions),
      (value) => value === 0,
    );
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const get = (route: string, as: string | null = token): request.Test => {
    const call = http().get(route);
    return as === null ? call : call.set('authorization', `Bearer ${as}`);
  };

  /** Distinct instants, so the cache that lives as long as the application never mixes two tests. */
  let written = Date.now() - 3_000;

  /** A conversation filed under the root, written a moment ago — active elsewhere. */
  function conversation(n: number, messages: readonly SessionMessage[]): string {
    const id = conversationId(n);
    store.add({
      sessionId: id,
      directory: allowlist.root,
      cwd: allowlist.root,
      lastModified: (written += 1),
      messages,
    });
    return id;
  }

  /** Records a conversation as opened here by somebody. */
  async function openedHere(id: string, subject: string): Promise<void> {
    await harness.app.get<SessionOriginRepository>(SESSION_ORIGIN_REPOSITORY).record({
      claudeSessionId: ClaudeSessionId.create(id),
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      openedBy: UserId.create(subject),
      workspace: WorkspacePath.create(allowlist.root),
      openedAt: new Date('2026-09-25T10:00:00.000Z'),
    });
  }

  /** A socket past its handshake. */
  async function connected(): Promise<TestSocket> {
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

  /** Frames until one matches — every frame read on the way, in order. */
  async function until(
    socket: TestSocket,
    matches: (frame: Envelope) => boolean,
    seen: Envelope[] = [],
  ): Promise<Envelope[]> {
    for (let taken = 0; taken < 40; taken += 1) {
      const frame = await socket.next();
      seen.push(frame);
      if (matches(frame)) {
        return seen;
      }
    }
    throw new Error('the frame never came');
  }

  /** Follows a conversation, and answers the ack — or the refusal. */
  async function follow(
    socket: TestSocket,
    id: string,
    afterMessageId?: string,
  ): Promise<Envelope> {
    const command = commandFrame('transcript.follow', {
      conversationId: id,
      ...(afterMessageId === undefined ? {} : { afterMessageId }),
    });
    socket.send(command);
    const frames = await until(socket, (frame) => frame.correlationId === command['id']);
    return frames.at(-1) as Envelope;
  }

  /** The next update of a subscription. */
  async function nextUpdate(socket: TestSocket, followId: string): Promise<Envelope> {
    const frames = await until(
      socket,
      (frame) =>
        (frame.type === 'transcript.appended' || frame.type === 'transcript.reset') &&
        frame.payload?.['followId'] === followId,
    );
    return frames.at(-1) as Envelope;
  }

  /** The `messageId` or `toolUseId` of each event of an update. */
  const keysOf = (frame: Envelope): string[] =>
    ((frame.payload?.['events'] ?? []) as { type: string; payload: Record<string, unknown> }[]).map(
      (event) =>
        `${event.type}:${String(event.payload['messageId'] ?? event.payload['toolUseId'])}`,
    );

  describe('the page says where the conversation ends — B-10', () => {
    it('answers the last entry of the chain, whatever the page — S-20', async () => {
      const history = recordedHistory('tool-turn');
      const id = conversation(1, history);

      const response = await get(`/transcripts/${id}/messages?limit=2`);

      expect(response.status).toBe(200);
      expect(response.body.lastMessageId).toBe(history.at(-1)?.uuid);
    });

    it('answers `null` for an empty conversation — S-20', async () => {
      const id = conversation(2, []);

      expect((await get(`/transcripts/${id}/messages`)).body.lastMessageId).toBeNull();
    });

    it('keeps the order of the chain, not of the clock: the queued prompt after the result — S-21', async () => {
      const history = recordedHistory('queue-turn');
      const id = conversation(3, history);

      const { events } = (await get(`/transcripts/${id}/messages`)).body as {
        events: { type: string; payload: Record<string, unknown> }[];
      };
      const queued = history[3];
      const order = events.map((event) => String(event.payload['messageId'] ?? event.type));

      // The recording stamped the queued prompt before the result it follows; the chain is the truth.
      const stamp = (entry: SessionMessage | undefined): string =>
        String((entry as { timestamp?: string } | undefined)?.timestamp);
      expect(stamp(queued) < stamp(history[2])).toBe(true);
      expect(order.indexOf(String(queued?.uuid))).toBeGreaterThan(order.indexOf('tool.completed'));
      expect(events.every((event) => typeof event.payload['at'] === 'string')).toBe(true);
    });
  });

  describe('the whole output of a tool — B-11', () => {
    it('answers the whole output, as text — S-22', async () => {
      const history = recordedHistory('bash-output-turn');
      const id = conversation(10, history);

      const response = await get(`/transcripts/${id}/tools/${firstToolOf(history)}/result`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ truncated: false });
      expect((response.body.text as string).trimEnd().split('\n')).toHaveLength(600);
      expect(response.body.bytes).toBe(Buffer.byteLength(response.body.text as string));
    });

    it('answers 404 for a tool the chain has no result of — S-24', async () => {
      const id = conversation(11, recordedHistory('tool-turn'));

      expect((await get(`/transcripts/${id}/tools/toolu_unknown/result`)).status).toBe(404);
    });

    it('answers another person`s conversation with the same 404 — S-25', async () => {
      const history = recordedHistory('bash-output-turn');
      const id = conversation(12, history);
      await openedHere(id, OTHER);

      const response = await get(`/transcripts/${id}/tools/${firstToolOf(history)}/result`);

      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('answers 401 to nobody, and to a bad token — S-26', async () => {
      const id = conversation(13, []);

      expect((await get(`/transcripts/${id}/tools/toolu_x/result`, null)).status).toBe(401);
      expect((await get(`/transcripts/${id}/tools/toolu_x/result`, 'not.a.token')).status).toBe(
        401,
      );
    });

    it('does not find the tool of a subagent by the main chain — S-28', async () => {
      const id = conversation(14, capturedTranscript('task-subagent-turn'));

      expect(
        (await get(`/transcripts/${id}/tools/toolu_014f5iBnPwwckKEK8h6CY2UN/result`)).status,
      ).toBe(404);
      expect(
        (await get(`/transcripts/${id}/tools/toolu_01LvP3tC4QzaKLSktbguFujt/result`)).status,
      ).toBe(200);
    });
  });

  describe('the image of a prompt — B-12', () => {
    const imageBlock = (history: readonly SessionMessage[]): string =>
      `${String(history[0]?.uuid)}:1`;

    it('serves the bytes, as an image and never as a document — S-29', async () => {
      const history = recordedHistory('image-turn');
      const id = conversation(20, history);

      const response = await get(`/transcripts/${id}/images/${imageBlock(history)}`).buffer(true);

      expect(response.status).toBe(200);
      expect(response.headers).toMatchObject({
        'content-type': 'image/png',
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
        'cache-control': 'private, no-store',
      });
      expect((response.body as Buffer).subarray(1, 4).toString('latin1')).toBe('PNG');
    });

    it('refuses an SVG with 415, and with the headers of an image route — S-30', async () => {
      const history = imagePrompt('image/svg+xml', Buffer.from('<svg/>').toString('base64'));
      const id = conversation(21, history);

      const response = await get(`/transcripts/${id}/images/${imageBlock(history)}`);

      expect(response.status).toBe(415);
      expect(response.body.error).toMatchObject({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        messageKey: 'transcript.error.imageTypeUnsupported',
      });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('serves 10 MiB, and refuses one byte more with 413 — S-31', async () => {
      const at = imagePrompt('image/png', Buffer.alloc(10 * MIB).toString('base64'));
      const over = imagePrompt('image/png', Buffer.alloc(10 * MIB + 1).toString('base64'));
      const fits = conversation(22, at);
      const big = conversation(23, over);

      const served = await get(`/transcripts/${fits}/images/${imageBlock(at)}`).buffer(true);
      const refused = await get(`/transcripts/${big}/images/${imageBlock(over)}`);

      expect(served.status).toBe(200);
      expect(served.headers['content-length']).toBe(String(10 * MIB));
      expect(refused.status).toBe(413);
      expect(refused.body.error).toMatchObject({ params: { size: 10 * MIB + 1, limit: 10 * MIB } });
    });

    it('answers 404 for a block that is no image, or of nothing, and 400 for no block id — S-32', async () => {
      const history = recordedHistory('image-turn');
      const id = conversation(24, history);

      expect((await get(`/transcripts/${id}/images/${String(history[0]?.uuid)}:0`)).status).toBe(
        404,
      );
      expect(
        (await get(`/transcripts/${conversationId(99)}/images/${imageBlock(history)}`)).status,
      ).toBe(404);
      expect((await get(`/transcripts/${id}/images/not-a-block`)).status).toBe(400);
    });

    it('serves the same bytes twice from one read of the store — S-34', async () => {
      const history = recordedHistory('image-turn');
      const id = conversation(25, history);

      await get(`/transcripts/${id}/messages`);
      const first = await get(`/transcripts/${id}/images/${imageBlock(history)}`).buffer(true);
      const second = await get(`/transcripts/${id}/images/${imageBlock(history)}`).buffer(true);

      expect(first.body).toEqual(second.body);
      expect(store.calls.getSessionMessages.filter((call) => call === id)).toHaveLength(1);
    });
  });

  describe('following a conversation — B-16, B-17', () => {
    it('acks first, then sends everything after the entry — even what was written in between — S-51, S-65', async () => {
      const history = recordedHistory('tool-turn');
      const id = conversation(30, history.slice(0, 4));
      const page = (await get(`/transcripts/${id}/messages`)).body as { lastMessageId: string };
      // Written between the page and the follow.
      store.append(id, history.slice(4, 6), (written += 1));
      const socket = await connected();

      const ack = await follow(socket, id, page.lastMessageId);
      const followId = String(ack.payload?.['followId']);
      const update = await nextUpdate(socket, followId);

      expect(ack).toMatchObject({
        kind: 'ack',
        type: 'transcript.following',
        payload: { conversationId: id, activity: 'activeElsewhere' },
      });
      expect(update.seq).toBe(1);
      expect(update.sessionId).toBeUndefined();
      // The Bash call and its result: the answer that called it, the tool, and how it went.
      expect(keysOf(update).map((key) => key.split(':')[0])).toEqual([
        'message.completed',
        'tool.started',
        'tool.completed',
      ]);
      expect(update.payload).toMatchObject({ lastMessageId: history[5]?.uuid, working: true });
    });

    it('sends what the conversation gains, once per write, in order — S-53, S-63', async () => {
      const history = recordedHistory('tool-turn');
      const id = conversation(31, history.slice(0, 2));
      const socket = await connected();
      const followId = String((await follow(socket, id, history[1]?.uuid)).payload?.['followId']);
      await nextUpdate(socket, followId);

      store.append(id, history.slice(2, 3), (written = Date.now()));
      const first = await nextUpdate(socket, followId);
      store.append(id, history.slice(3, 4), (written += 1));
      const second = await nextUpdate(socket, followId);

      expect([first.seq, second.seq]).toEqual([2, 3]);
      expect(first.payload?.['lastMessageId']).toBe(history[2]?.uuid);
      expect(second.payload?.['lastMessageId']).toBe(history[3]?.uuid);
    });

    it('reads a conversation once per write for every follower of it — S-54', async () => {
      const history = recordedHistory('tool-turn');
      const id = conversation(32, history.slice(0, 2));
      const sockets = await Promise.all([connected(), connected(), connected()]);
      const ids = await Promise.all(
        sockets.map(async (socket) =>
          String((await follow(socket, id, history[1]?.uuid)).payload?.['followId']),
        ),
      );
      await Promise.all(sockets.map((socket, index) => nextUpdate(socket, String(ids[index]))));
      const reads = store.calls.getSessionMessages.filter((call) => call === id).length;

      store.append(id, history.slice(2, 3), (written = Date.now()));
      const updates = await Promise.all(
        sockets.map((socket, index) => nextUpdate(socket, String(ids[index]))),
      );

      expect(updates.map((update) => update.payload?.['lastMessageId'])).toEqual([
        history[2]?.uuid,
        history[2]?.uuid,
        history[2]?.uuid,
      ]);
      expect(store.calls.getSessionMessages.filter((call) => call === id).length).toBe(reads + 1);
      expect(harness.app.get(FollowTranscriptUseCase).followedConversations).toBe(1);
    });

    it('resets a follower whose entry a rewrite took — S-55', async () => {
      const history = recordedHistory('tool-turn');
      const id = conversation(33, history);
      const socket = await connected();
      const followId = String(
        (await follow(socket, id, history.at(-1)?.uuid)).payload?.['followId'],
      );
      await nextUpdate(socket, followId);

      store.rewrite(id, recordedHistory('thinking-turn'), (written = Date.now()));
      const reset = await nextUpdate(socket, followId);

      expect(reset).toMatchObject({
        type: 'transcript.reset',
        payload: { followId, conversationId: id, reason: 'rewritten' },
      });
    });

    it('resets every follower of a conversation that went — S-56', async () => {
      const id = conversation(34, recordedHistory('thinking-turn'));
      const socket = await connected();
      const followId = String((await follow(socket, id)).payload?.['followId']);
      await nextUpdate(socket, followId);

      store.remove(id);

      expect((await nextUpdate(socket, followId)).payload).toMatchObject({ reason: 'gone' });
    });

    it('refuses a conversation a live session of the caller holds — S-58', async () => {
      const socket = await connected();
      socket.send(commandFrame('session.start', { workspacePath: allowlist.root }));
      const started = (await until(socket, (frame) => frame.type === 'session.started')).at(-1);
      const live = String(started?.payload?.['claudeSessionId']);
      store.add({
        sessionId: live,
        directory: allowlist.root,
        cwd: allowlist.root,
        lastModified: Date.now(),
      });

      const refusal = await follow(socket, live);

      expect(refusal).toMatchObject({
        kind: 'error',
        payload: {
          code: 'TRANSCRIPT_FOLLOW_LIVE_HERE',
          messageKey: 'transcript.error.followLiveHere',
        },
      });
    });

    it('answers a conversation of another person, and one that is not there, alike — S-60', async () => {
      const theirs = conversation(35, []);
      await openedHere(theirs, OTHER);
      const socket = await connected();

      const refusals = [await follow(socket, theirs), await follow(socket, conversationId(98))];

      expect(refusals.map((frame) => [frame.kind, frame.payload?.['code']])).toEqual([
        ['error', 'NOT_FOUND'],
        ['error', 'NOT_FOUND'],
      ]);
      expect(socket.isOpen).toBe(true);
    });

    it('lets a connection follow four, and refuses the fifth — S-61', async () => {
      const socket = await connected();
      for (let n = 40; n < 44; n += 1) {
        expect((await follow(socket, conversation(n, []))).type).toBe('transcript.following');
      }

      const refusal = await follow(socket, conversation(44, []));

      expect(refusal.payload).toMatchObject({
        code: 'TRANSCRIPT_FOLLOW_LIMIT',
        params: { limit: 4, scope: 'connection' },
      });
    });

    it('refuses the seventeenth conversation of the server, and takes one when another is let go — S-62', async () => {
      const sockets = await Promise.all(Array.from({ length: 5 }, () => connected()));
      const ids = Array.from({ length: 17 }, (_, index) => conversation(50 + index, []));
      const acks: Envelope[] = [];
      for (let index = 0; index < 16; index += 1) {
        acks.push(await follow(sockets[Math.floor(index / 4)] as TestSocket, ids[index] as string));
      }

      const refused = await follow(sockets[4] as TestSocket, ids[16] as string);
      const [first] = sockets;
      first?.send(
        commandFrame('transcript.unfollow', { followId: String(acks[0]?.payload?.['followId']) }),
      );
      await waitFor(
        'followedConversations to settle',
        () => Promise.resolve(harness.app.get(FollowTranscriptUseCase).followedConversations),
        (value) => value === 15,
      );
      const taken = await follow(sockets[4] as TestSocket, ids[16] as string);

      expect(refused.payload).toMatchObject({ params: { limit: 16, scope: 'server' } });
      expect(taken.type).toBe('transcript.following');
    });

    it('gives the same entries to the same follow twice — S-64', async () => {
      const history = recordedHistory('tool-turn');
      const id = conversation(70, history);
      const [one, two] = [await connected(), await connected()];

      const first = String((await follow(one, id, history[6]?.uuid)).payload?.['followId']);
      const second = String((await follow(two, id, history[6]?.uuid)).payload?.['followId']);

      expect(keysOf(await nextUpdate(one, first))).toEqual(keysOf(await nextUpdate(two, second)));
    });

    it('acknowledges an unfollow twice, and one of a subscription it never had — S-66', async () => {
      const id = conversation(71, []);
      const socket = await connected();
      const followId = String((await follow(socket, id)).payload?.['followId']);

      const answers: Envelope[] = [];
      for (const target of [followId, followId, 't_never']) {
        const command = commandFrame('transcript.unfollow', { followId: target });
        socket.send(command);
        answers.push(
          (await until(socket, (frame) => frame.correlationId === command['id'])).at(
            -1,
          ) as Envelope,
        );
      }

      expect(answers.map((frame) => frame.type)).toEqual([
        'command.accepted',
        'command.accepted',
        'command.accepted',
      ]);
    });

    it('lets go of what a connection followed when it drops, and the others carry on — S-67, S-68', async () => {
      const history = recordedHistory('tool-turn');
      const id = conversation(72, history.slice(0, 2));
      const leaving = await connected();
      const staying = await connected();
      await follow(leaving, id, history[1]?.uuid);
      await follow(leaving, conversation(73, []));
      const followId = String((await follow(staying, id, history[1]?.uuid)).payload?.['followId']);
      await nextUpdate(staying, followId);

      leaving.close();
      await waitFor(
        'subscriptions to settle',
        () => Promise.resolve(harness.app.get(FollowTranscriptUseCase).subscriptions),
        (value) => value === 1,
      );
      store.append(id, history.slice(2, 3), (written = Date.now()));

      expect((await nextUpdate(staying, followId)).payload?.['lastMessageId']).toBe(
        history[2]?.uuid,
      );
      expect(harness.app.get(FollowTranscriptUseCase).followedConversations).toBe(1);
    });

    it('refuses a payload it cannot read, with every invalid field — S-69', async () => {
      const socket = await connected();
      const command = commandFrame('transcript.follow', {
        conversationId: 'not-a-uuid',
        afterMessageId: 42,
      });
      socket.send(command);

      const refusal = (await until(socket, (frame) => frame.correlationId === command['id'])).at(
        -1,
      );

      expect(refusal).toMatchObject({ kind: 'error', payload: { code: 'INVALID_INPUT' } });
      expect((refusal?.payload?.['details'] as unknown[]).length).toBe(2);
    });

    it('sends a reconnecting reader only what it missed — S-70', async () => {
      const history = recordedHistory('tool-turn');
      const id = conversation(74, history.slice(0, 4));
      const before = await connected();
      const followId = String((await follow(before, id, history[1]?.uuid)).payload?.['followId']);
      const lastSeen = String((await nextUpdate(before, followId)).payload?.['lastMessageId']);
      before.close();

      store.append(id, history.slice(4, 6), (written = Date.now()));
      const after = await connected();
      const again = String((await follow(after, id, lastSeen)).payload?.['followId']);
      const update = await nextUpdate(after, again);

      expect(lastSeen).toBe(history[3]?.uuid);
      expect(update.payload?.['lastMessageId']).toBe(history[5]?.uuid);
      expect(keysOf(update).some((key) => key.includes(String(history[2]?.uuid)))).toBe(false);
    });
  });

  describe('a question of Claude, followed — plan 24, B-21', () => {
    const QUESTION = 'toolu_01GpjZVmiX4rEFumRubJuXzV';

    beforeEach(async () => {
      const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
      await db.execute(sql`TRUNCATE TABLE "permission_requests"`);
    });

    it('delivers the end of the question with what was answered here — S-100', async () => {
      const history = recordedHistory('question-turn');
      const end = history.findIndex((entry) =>
        JSON.stringify(entry.message).includes(`"tool_use_id":"${QUESTION}"`),
      );
      const id = conversation(40, history.slice(0, end));
      const answers = [{ questionId: 'q1', selected: ['Installation'] }];
      const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
      await db.execute(sql`
        INSERT INTO "permission_requests"
          ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "risk_hint", "status",
           "decision", "answers", "requested_at", "expires_at")
        VALUES
          ('req-followed', ${SUBJECT}, '01J0ABCDEFGHJKMNPQRSTVWXYZ', ${QUESTION}, 'AskUserQuestion',
           '{}'::jsonb, 'read', 'resolved', 'allow', ${JSON.stringify(answers)}::jsonb,
           now(), now() + interval '10 minutes')
      `);
      const socket = await connected();
      const followId = String(
        (await follow(socket, id, history[end - 1]?.uuid)).payload?.['followId'],
      );
      await nextUpdate(socket, followId);

      // The answer is written: the line of the question ends, in the conversation followed.
      store.append(id, history.slice(end, end + 1), (written = Date.now()));
      const update = await nextUpdate(socket, followId);
      const completed = (
        (update.payload?.['events'] ?? []) as { type: string; payload: Record<string, unknown> }[]
      ).find((event) => event.type === 'tool.completed' && event.payload['toolUseId'] === QUESTION);

      expect(completed?.payload['question']).toMatchObject({
        interaction: { kind: 'question' },
        outcome: 'answered',
        answers,
      });
    });
  });

  describe('the door of the e2e suite into Claude`s store — B-34', () => {
    /** What the door is asked to do, as the suite asks it. */
    const plant = (id: string, fixture: string, history = true): request.Test =>
      http().post(ELSEWHERE_PATH).send({
        conversationId: id,
        cwd: allowlist.root,
        fixture,
        title: 'Begun elsewhere',
        history,
      });
    const append = (id: string, fixture: string, from?: number, to?: number): request.Test =>
      http().post(`${ELSEWHERE_PATH}/${id}/entries`).send({ fixture, from, to });
    const rewrite = (id: string, fixture: string): request.Test =>
      http().put(`${ELSEWHERE_PATH}/${id}/chain`).send({ fixture });

    /** The uuids a recording's history has once the door planted it as its `copy`-th conversation. */
    const uuidsOf = (fixture: string, copy: number): string[] =>
      recordedHistory(fixture, copy).map((entry) => entry.uuid);

    it('plants what a recording read back, and writes its next entries now — what the follower sends — S-123', async () => {
      const id = conversationId(80);
      const planted = uuidsOf('thinking-turn', 1);
      const grown = uuidsOf('bash-output-turn', 1);

      expect((await plant(id, 'thinking-turn')).status).toBe(201);
      const page = (await get(`/transcripts/${id}/messages`)).body as {
        lastMessageId: string;
        session: { activity: string };
      };
      const socket = await connected();
      const followId = String((await follow(socket, id, page.lastMessageId)).payload?.['followId']);
      await nextUpdate(socket, followId);

      expect((await append(id, 'bash-output-turn', 0, 2)).status).toBe(204);
      const asked = await nextUpdate(socket, followId);
      expect((await append(id, 'bash-output-turn', 2)).status).toBe(204);
      const answered = await nextUpdate(socket, followId);

      expect(page.lastMessageId).toBe(planted.at(-1));
      expect(page.session.activity).toBe('activeElsewhere');
      // The prompt and the call: the turn is open, so it is worked on elsewhere.
      expect(asked.payload).toMatchObject({ lastMessageId: grown[1], working: true });
      expect(keysOf(asked)).toContain(`message.completed:${String(grown[0])}`);
      // The result and the answer of only text: the turn closed.
      expect(answered.payload).toMatchObject({ lastMessageId: grown[3], working: false });
      expect(keysOf(answered).map((key) => key.split(':')[0])).toEqual([
        'tool.completed',
        'message.completed',
      ]);
    });

    it('rewrites the chain as a compaction does: the follower is reset, and the page reads the summary — S-123', async () => {
      const id = conversationId(81);
      expect((await plant(id, 'tool-turn')).status).toBe(201);
      const socket = await connected();
      const followId = String(
        (await follow(socket, id, uuidsOf('tool-turn', 1).at(-1))).payload?.['followId'],
      );
      await nextUpdate(socket, followId);

      expect((await rewrite(id, 'compact-turn')).status).toBe(204);
      const reset = await nextUpdate(socket, followId);
      const { events } = (await get(`/transcripts/${id}/messages`)).body as {
        events: { type: string; payload: { role?: string; content?: { text?: string }[] } }[];
      };

      expect(reset.payload).toMatchObject({ reason: 'rewritten' });
      expect(events[0]?.payload.content?.[0]?.text).toMatch(
        /^This session is being continued from a previous conversation/,
      );
      expect(events.some((event) => event.type === 'tool.started')).toBe(false);
    });

    it('plants the messages of a stream when the history is not asked for, as plan 08 does — S-123', async () => {
      const id = conversationId(82);

      expect((await plant(id, 'text-turn', false)).status).toBe(201);
      expect((await get(`/transcripts/${id}/messages`)).body.lastMessageId).toBe(
        capturedTranscript('text-turn', 1).at(-1)?.uuid,
      );
    });

    it('answers 404 for a conversation it did not plant, and 400 for what is not a recording — S-123', async () => {
      const id = conversationId(83);
      const elsewhere = conversationId(84);

      expect((await append(elsewhere, 'thinking-turn')).status).toBe(404);
      expect((await rewrite(elsewhere, 'compact-turn')).status).toBe(404);
      expect((await plant(id, '../../../package')).status).toBe(400);
      expect((await plant(id, 'no-such-turn')).status).toBe(400);
      expect((await plant(id, 'thinking-turn')).status).toBe(201);
      // A recording that kept no history, and one with no compaction.
      expect((await append(id, 'text-turn')).body.error).toMatch(/kept no history/);
      expect((await rewrite(id, 'thinking-turn')).body.error).toMatch(/has no compaction/);
      expect((await get(`/transcripts/${id}/messages`)).body.lastMessageId).toBe(
        uuidsOf('thinking-turn', 1).at(-1),
      );
    });

    it('is mounted by the e2e entry point only — S-123', () => {
      const source = (file: string): string =>
        readFileSync(path.join(import.meta.dirname, file), 'utf8');

      expect(source('../../../../../src/main.ts')).not.toMatch(/e2e|conversations-elsewhere/);
      expect(source('../../../../e2e/scripted-main.ts')).toContain(
        'app.use(ELSEWHERE_PATH, conversationsElsewhere(transcripts))',
      );
    });
  });
});
