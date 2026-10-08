import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { historicalEvents } from '@adapter/outbound/claude/sdk-message.mapper';
import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import {
  TRANSCRIPT_LIMITS,
  TRANSCRIPT_READ_LIMITS,
} from '@adapter/outbound/claude/transcript-reads';
import { SESSION_ORIGIN_REPOSITORY } from '@application/session';
import type { SessionOriginRepository } from '@application/session';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import {
  capturedTranscript,
  ScriptedTranscripts,
} from '../../../../fakes/agent-sdk/scripted-transcripts';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT } from '../../../../support/app/test-app';
import { waitFor } from '../../../../support/app/wait-for';
import type { TestAllowlist, TestApp } from '../../../../support/app/test-app';
import { conversationId } from '../../../../support/builders/transcript.builder';

const OTHER = 'auth|other';

/** Two roots: one of the suite's subject, one of somebody else. */
function twoRootAllowlist(): TestAllowlist & { readonly theirs: string } {
  const directory = mkdtempSync(path.join(tmpdir(), 'rc-transcript-'));
  const root = path.join(directory, 'mine');
  const theirs = path.join(directory, 'theirs');
  const file = path.join(directory, 'allowlist.yaml');

  mkdirSync(root);
  mkdirSync(theirs);
  writeFileSync(
    file,
    `roots:\n  - path: ${root}\n    label: Mine\n    users:\n      - ${SUBJECT}\n` +
      `  - path: ${theirs}\n    label: Theirs\n    users:\n      - ${OTHER}\n`,
    'utf8',
  );

  return { file, root, theirs };
}

/**
 * `GET /transcripts` and `GET /transcripts/:sessionId/messages`, against the real application —
 * plan 04, F0.
 *
 * The guard, the pipes, the filter, the use cases, the adapter with its cache and its limiter, and
 * PostgreSQL are the production ones. Only Claude's store is scripted, and what it holds is derived
 * from a run captured of the real SDK.
 */
describe('the transcript HTTP surface', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let allowlist: ReturnType<typeof twoRootAllowlist>;
  let store: ScriptedTranscripts;
  let token: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    allowlist = twoRootAllowlist();

    harness = await startTestApp(
      database.url,
      identity,
      // Replaced through a mutable holder rather than a value: every test gets a fresh store, and
      // the container is built once.
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
          // Every test gets a store of its own: a whole store kept from the previous one would be
          // somebody else's history. The keeping itself has a test of its own, in the adapter's.
          .overrideProvider(TRANSCRIPT_LIMITS)
          .useValue({ ...TRANSCRIPT_READ_LIMITS, wholeStoreTtlMs: 0 })
          // A session that stays alive and says nothing: what makes a conversation `liveHere`.
          .overrideProvider(QUERY_FACTORY)
          .useValue(((params) =>
            scriptedSdk({ silent: true }).createQuery(params)) as QueryFactory),
      allowlist,
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
    const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
    await db.execute(sql`TRUNCATE TABLE "session_origins"`);
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());

  const list = (query: Record<string, string> = {}, as: string | null = token): request.Test => {
    const call = http()
      .get('/transcripts')
      .query({ workspacePath: allowlist.root, ...query });
    return as === null ? call : call.set('authorization', `Bearer ${as}`);
  };

  const read = (
    id: string,
    query: Record<string, string> = {},
    as: string | null = token,
  ): request.Test => {
    const call = http().get(`/transcripts/${id}/messages`).query(query);
    return as === null ? call : call.set('authorization', `Bearer ${as}`);
  };

  /** Records a conversation as opened here, by `subject`. */
  async function openedHere(id: string, subject = SUBJECT): Promise<void> {
    await harness.app.get<SessionOriginRepository>(SESSION_ORIGIN_REPOSITORY).record({
      claudeSessionId: ClaudeSessionId.create(id),
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      openedBy: UserId.create(subject),
      workspace: WorkspacePath.create(allowlist.root),
      openedAt: new Date('2026-09-25T10:00:00.000Z'),
    });
  }

  /**
   * Every conversation seeded gets an instant of its own. The adapter's cache lives as long as the
   * application, and it is keyed by id **and** `lastModified` — the same pair in two tests would be
   * the same conversation as far as it can tell, which is exactly its contract.
   */
  let written = 1_758_800_000_000;

  /** A conversation filed under the suite's root. */
  function conversation(
    n: number,
    overrides: { cwd?: string | null; lastModified?: number; turns?: number } = {},
  ): string {
    const id = conversationId(n);
    const turns = overrides.turns ?? 1;

    store.add({
      sessionId: id,
      directory: allowlist.root,
      ...(overrides.cwd === null ? {} : { cwd: overrides.cwd ?? allowlist.root }),
      lastModified: overrides.lastModified ?? (written += 1_000),
      messages: Array.from({ length: turns }, (_, turn) =>
        capturedTranscript('tool-turn', turn),
      ).flat(),
    });

    return id;
  }

  /** The ids of the events' messages, which is what a client dedupes on. */
  const eventKeys = (body: { events: { type: string; payload: Record<string, unknown> }[] }) =>
    body.events.map(
      (event) =>
        `${event.type}:${String(event.payload['messageId'] ?? event.payload['toolUseId'])}`,
    );

  describe('who may ask', () => {
    it('answers `401` to nobody in particular', async () => {
      expect((await list({}, null)).status).toBe(401);
      expect((await read(conversationId(1), {}, null)).status).toBe(401);
    });
  });

  describe('the listing', () => {
    it('lists ours and the ones begun elsewhere, each with its origin — S-01', async () => {
      const ours = conversation(1, { lastModified: 2_000 });
      const external = conversation(2, { lastModified: 1_000 });
      await openedHere(ours);

      const response = await list();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        sessions: [
          {
            sessionId: ours,
            summary: expect.any(String),
            origin: 'ours',
            cwd: allowlist.root,
            gitBranch: null,
            createdAt: null,
            lastModified: new Date(2_000).toISOString(),
            activity: 'idle',
            liveSessionId: null,
            writtenAgoSeconds: expect.any(Number),
          },
          expect.objectContaining({ sessionId: external, origin: 'external' }),
        ],
        nextCursor: null,
      });
    });

    it('asks the SDK for one directory and never for its worktrees — D-01', async () => {
      await list();

      expect(store.calls.listSessions).toEqual([{ dir: allowlist.root, includeWorktrees: false }]);
    });

    it('leaves out a conversation with no working directory — S-54', async () => {
      conversation(1, { cwd: null });

      expect((await list()).body.sessions).toEqual([]);
    });

    it('leaves out one whose working directory is outside the caller`s roots — S-55', async () => {
      // Filed under the root, and run somewhere else: a worktree is another path on disk.
      conversation(1, { cwd: `${allowlist.root}-worktrees/feature` });

      expect((await list()).body.sessions).toEqual([]);
    });

    it('leaves out one another person opened here — S-04', async () => {
      await openedHere(conversation(1), OTHER);

      expect((await list()).body.sessions).toEqual([]);
    });

    it('pages with the cursor it hands out, neither repeating nor skipping — S-57', async () => {
      conversation(1, { lastModified: 3_000 });
      conversation(2, { lastModified: 2_000 });
      conversation(3, { lastModified: 1_000 });

      const first = await list({ limit: '1' });
      // The oldest one is written to between the two pages: it moves above the window already read.
      store.append(conversationId(3), [], 9_000);
      const rest = await list({ cursor: String(first.body.nextCursor), limit: '10' });

      expect(first.body.sessions.map((s: { sessionId: string }) => s.sessionId)).toEqual([
        conversationId(1),
      ]);
      expect(rest.body.sessions.map((s: { sessionId: string }) => s.sessionId)).toEqual([
        conversationId(2),
      ]);
      expect(rest.body.nextCursor).toBeNull();
    });

    it.each([
      ['outside every root', '/etc', 'WORKSPACE_NOT_ALLOWED'],
      ['a root of somebody else', 'theirs', 'FORBIDDEN'],
    ])('refuses a workspace %s with `403`, before asking the SDK — S-73', async (_c, at, code) => {
      const workspacePath = at === 'theirs' ? allowlist.theirs : at;

      const response = await list({ workspacePath });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(code);
      expect(store.calls.listSessions).toEqual([]);
    });

    it.each([
      ['a relative path', { workspacePath: 'relative' }],
      ['a cursor it never handed out', { cursor: 'nope' }],
      ['a page above the ceiling', { limit: '101' }],
    ])('refuses %s with `400`', async (_case, query) => {
      const response = await list(query);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('answers `502`, never `500`, when the SDK fails — S-05', async () => {
      store.failWith = new Error('EACCES: ~/.claude/projects');

      const response = await list();

      expect(response.status).toBe(502);
      expect(response.body.error).toMatchObject({
        code: 'CLAUDE_UNAVAILABLE',
        messageKey: 'transcript.error.claudeUnavailable',
      });
      expect(response.text).not.toContain('EACCES');
    });
  });

  /** Plan 08, B-08 — what each conversation is doing, and the folders below the one asked about. */
  describe('the activity of the history', () => {
    const open: TestSocket[] = [];

    afterAll(() => {
      for (const socket of open) {
        socket.close();
      }
    });

    /** Opens a session on the suite's root over a real socket, and answers its conversation. */
    async function liveConversation(): Promise<{ sessionId: string; conversation: string }> {
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
      socket.send(commandFrame('session.start', { workspacePath: allowlist.root }));

      for (let taken = 0; taken < 50; taken += 1) {
        const frame = await socket.next();
        if (frame.type === 'session.started') {
          return {
            sessionId: String(frame.payload?.['sessionId']),
            conversation: String(frame.payload?.['claudeSessionId']),
          };
        }
      }
      throw new Error('no session.started');
    }

    it('says live here, active elsewhere or idle, by the backend’s clock — S-25', async () => {
      const recent = conversation(7, { lastModified: Date.now() - 5_000 });
      const old = conversation(8, { lastModified: Date.now() - 3_600_000 });

      const sessions = (await list()).body.sessions as { sessionId: string; activity: string }[];

      expect(sessions.find((row) => row.sessionId === recent)?.activity).toBe('activeElsewhere');
      expect(sessions.find((row) => row.sessionId === old)?.activity).toBe('idle');
    });

    it('names the live session that holds a conversation of the caller — S-27', async () => {
      const live = await liveConversation();
      store.add({
        sessionId: live.conversation,
        directory: allowlist.root,
        cwd: allowlist.root,
        lastModified: Date.now(),
      });

      const row = ((await list()).body.sessions as Record<string, unknown>[]).find(
        (entry) => entry['sessionId'] === live.conversation,
      );

      expect(row).toMatchObject({
        origin: 'ours',
        activity: 'liveHere',
        liveSessionId: live.sessionId,
      });
    });

    it('with the subfolders, lists what ran below the folder, and only that — D-05', async () => {
      const below = path.join(allowlist.root, 'backend');
      store
        .add({
          sessionId: conversationId(21),
          directory: below,
          cwd: below,
          lastModified: (written += 1_000),
        })
        .add({
          sessionId: conversationId(22),
          directory: `${allowlist.root}-old`,
          cwd: `${allowlist.root}-old`,
          lastModified: (written += 1_000),
        });

      const exact = await list();
      const deep = await list({ includeSubfolders: 'true' });

      expect((exact.body.sessions as unknown[]).length).toBe(0);
      expect((deep.body.sessions as { sessionId: string }[]).map((row) => row.sessionId)).toEqual([
        conversationId(21),
      ]);
      expect(store.calls.listSessions.at(-1)).toEqual({ includeWorktrees: false });
    });

    it('brings nothing from a subfolder whose real path leaves the root — S-29', async () => {
      // The CLI records the real path of its process: a subfolder that links out records where it
      // points, which is outside every root of the caller.
      store.add({
        sessionId: conversationId(23),
        directory: allowlist.theirs,
        cwd: allowlist.theirs,
        lastModified: (written += 1_000),
      });

      expect((await list({ includeSubfolders: 'true' })).body.sessions).toEqual([]);
    });

    it('keeps the cursor stable under a concurrent write, with the subfolders — S-30', async () => {
      const below = path.join(allowlist.root, 'pages');
      for (const n of [31, 32, 33]) {
        store.add({
          sessionId: conversationId(n),
          directory: below,
          cwd: below,
          lastModified: (written += 1_000),
        });
      }

      const first = await list({ includeSubfolders: 'true', limit: '2' });
      // The newest one is written again between the two pages: it moves up, above what was read.
      store.append(conversationId(33), [], (written += 1_000));
      const second = await list({
        includeSubfolders: 'true',
        limit: '2',
        cursor: String(first.body.nextCursor),
      });

      const ids = [...first.body.sessions, ...second.body.sessions].map(
        (row: { sessionId: string }) => row.sessionId,
      );
      expect(ids).toEqual([conversationId(33), conversationId(32), conversationId(31)]);
    });

    it('answers CLAUDE_UNAVAILABLE for the history while the live sessions still answer — S-32', async () => {
      store.failWith = new Error('the store is gone');

      const history = await list();
      const live = await http()
        .get('/sessions')
        .query({ workspacePath: allowlist.root })
        .set('authorization', `Bearer ${token}`);

      expect([history.status, history.body.error.code]).toEqual([502, 'CLAUDE_UNAVAILABLE']);
      expect(live.status).toBe(200);
    });
  });

  /** Plan 08, B-21 — what a subagent said, loaded when its tool is unfolded. */
  describe('the task list of a conversation — plan 08, B-20', () => {
    it('reads back the id of every task created, from the text the store kept — S-87', async () => {
      const id = conversationId(80);
      store.add({
        sessionId: id,
        directory: allowlist.root,
        cwd: allowlist.root,
        lastModified: (written += 1_000),
        messages: capturedTranscript('task-tools-turn'),
      });

      const response = await read(id, { limit: '100' });
      const events = response.body.events as { type: string; payload: Record<string, unknown> }[];

      expect(response.status).toBe(200);
      expect(
        events
          .filter((event) => event.type === 'tool.completed' && 'taskId' in event.payload)
          .map((event) => event.payload['taskId']),
      ).toEqual(['1', '2', '3']);
    });
  });

  describe('a subagent of a conversation', () => {
    const subagent = (id: string, tool: string, as: string | null = token): request.Test => {
      const call = http().get(`/transcripts/${id}/subagents/${tool}/messages`);
      return as === null ? call : call.set('authorization', `Bearer ${as}`);
    };

    it('answers what the subagent of a tool said, nested under it — S-90', async () => {
      const id = conversation(51);
      const nested = capturedTranscript('task-subagent-turn').filter(
        (message) => message.parent_tool_use_id !== null,
      );
      const tool = String(nested[0]?.parent_tool_use_id);
      store.addSubagent(id, 'agent-1', nested);

      const response = await subagent(id, tool);

      expect(response.status).toBe(200);
      expect(response.body.events.length).toBeGreaterThan(0);
      expect(
        (response.body.events as { payload: Record<string, unknown> }[]).every(
          (event) => event.payload['parentToolUseId'] === tool,
        ),
      ).toBe(true);
    });

    it('answers 404 for a conversation the caller does not read, and for a tool with no subagent — S-91', async () => {
      const theirs = conversation(52, { cwd: allowlist.theirs });
      store.addSubagent(theirs, 'agent-1', capturedTranscript('task-subagent-turn'));
      const mine = conversation(53);

      expect((await subagent(theirs, 'toolu_x')).status).toBe(404);
      expect((await subagent(mine, 'toolu_none')).status).toBe(404);
    });

    it('answers 400 for a tool id this server cannot name', async () => {
      expect((await subagent(conversation(54), 'not%20one')).status).toBe(400);
    });
  });

  describe('a conversation', () => {
    it('comes back as the events of the live contract, latest page first — S-02', async () => {
      const id = conversation(1);

      const response = await read(id);

      expect(response.status).toBe(200);
      expect(response.body.session).toMatchObject({ sessionId: id, origin: 'external' });
      expect(new Set(response.body.events.map((e: { type: string }) => e.type))).toEqual(
        new Set(['message.completed', 'tool.started', 'tool.completed']),
      );
      expect(response.body.nextCursor).toBeNull();
    });

    it('is paged from the tail, and the next page continues where the last stopped — S-06', async () => {
      const id = conversation(1, { turns: 6 });
      const total = capturedTranscript('tool-turn').length * 6;
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const response = await read(
          id,
          cursor === null ? { limit: '25' } : { cursor, limit: '25' },
        );
        seen.unshift(...eventKeys(response.body));
        cursor = response.body.nextCursor as string | null;
        pages += 1;
      } while (cursor !== null);

      const whole = await read(id, { limit: '100' });
      expect(pages).toBe(Math.ceil(total / 25));
      expect(seen).toEqual(eventKeys(whole.body));
    });

    it('answers the same page twice with the same content — S-07', async () => {
      const id = conversation(1, { turns: 3 });
      const first = await read(id, { limit: '5' });

      const again = await read(id, { cursor: String(first.body.nextCursor), limit: '5' });
      const twice = await read(id, { cursor: String(first.body.nextCursor), limit: '5' });

      // The page is the subject here. `writtenAgoSeconds` is read off the wall clock at each
      // request, so two requests that straddle a second disagree on it by that second — and only
      // by that second.
      const clockless = (body: Record<string, unknown>) => {
        const { writtenAgoSeconds, ...session } = body['session'] as Record<string, unknown>;
        return { body: { ...body, session }, writtenAgoSeconds: Number(writtenAgoSeconds) };
      };
      const one = clockless(again.body);
      const other = clockless(twice.body);

      expect(one.body).toEqual(other.body);
      expect(Math.abs(one.writtenAgoSeconds - other.writtenAgoSeconds)).toBeLessThanOrEqual(1);
    });

    it('parses a conversation once, and again only once it was written to — S-64', async () => {
      const id = conversation(1);

      await read(id);
      await read(id);
      expect(store.calls.getSessionMessages).toHaveLength(1);

      store.append(id, capturedTranscript('tool-turn', 7), (written += 1_000));
      const grown = await read(id, { limit: '100' });

      expect(store.calls.getSessionMessages).toHaveLength(2);
      expect(grown.body.events.length).toBeGreaterThan(0);
    });

    it('is a consistent page while the live session writes under it — S-08', async () => {
      const id = conversation(1, { turns: 2 });
      const gate = store.hold();

      const pending = read(id, { limit: '100' }).then((response) => response);
      await waitFor(
        'the read reaching the SDK',
        () => Promise.resolve(store.calls.getSessionMessages.length),
        (calls) => calls === 1,
      );
      // Written while the read is in flight: the page is one parse, never half of each.
      store.append(id, capturedTranscript('tool-turn', 5), (written += 1_000));
      gate.open();

      const response = await pending;
      const snapshot = [capturedTranscript('tool-turn', 0), capturedTranscript('tool-turn', 1)]
        .flat()
        .flatMap((message) => historicalEvents(message));

      expect(response.status).toBe(200);
      expect(response.body.events).toEqual(snapshot);
    });

    it('continues from its cursor after the live session appended, without a repeat — S-57', async () => {
      const id = conversation(1, { turns: 2 });
      const first = await read(id, { limit: '5' });

      store.append(id, capturedTranscript('tool-turn', 9), (written += 1_000));
      const second = await read(id, { cursor: String(first.body.nextCursor), limit: '5' });

      const firstKeys = new Set(eventKeys(first.body));
      expect(eventKeys(second.body).some((key) => firstKeys.has(key))).toBe(false);
    });

    it('answers an empty conversation with an empty page, not an error — S-03', async () => {
      const id = conversationId(1);
      store.add({
        sessionId: id,
        directory: allowlist.root,
        cwd: allowlist.root,
        lastModified: (written += 1_000),
      });

      const response = await read(id);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ events: [], nextCursor: null });
    });

    it('answers an id that names nothing with `404`, not an empty page — S-56', async () => {
      const response = await read(conversationId(9));

      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({
        code: 'NOT_FOUND',
        messageKey: 'transcript.error.notFound',
      });
      expect(store.calls.getSessionMessages).toEqual([]);
    });

    it('answers another person`s conversation with the same `404` — S-04', async () => {
      const id = conversation(1);
      await openedHere(id, OTHER);

      const response = await read(id);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.text).not.toContain(OTHER);
    });

    it('answers one outside the caller`s roots with the same `404` — S-55', async () => {
      const id = conversation(1, { cwd: allowlist.theirs });

      expect((await read(id)).status).toBe(404);
    });

    it('refuses a cursor whose message is gone, with `400` — S-69', async () => {
      const id = conversation(1, { turns: 2 });
      const first = await read(id, { limit: '5' });

      // A compaction: the chain the SDK rebuilds no longer holds the message the cursor named.
      store.rewrite(id, capturedTranscript('tool-turn', 3), (written += 1_000));
      const response = await read(id, { cursor: String(first.body.nextCursor), limit: '5' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'INVALID_INPUT',
        messageKey: 'transcript.error.cursorStale',
      });
    });

    it.each([
      ['an id that is not a conversation', 'not-a-uuid', {}],
      ['a cursor that is not a message', conversationId(1), { cursor: 'm1' }],
      ['a page of none', conversationId(1), { limit: '0' }],
    ])('refuses %s with `400`', async (_case, id, query) => {
      const response = await read(id, query);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('answers `502`, never `500`, when the SDK fails — S-05', async () => {
      const id = conversation(1);
      store.failWith = new Error('boom');

      const response = await read(id);

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe('CLAUDE_UNAVAILABLE');
    });
  });

  /**
   * Plan 24, B-21 — a question of Claude read back: the questions from the transcript, and how they
   * ended from what this backend recorded when they were answered, joined by the tool call.
   */
  describe('the questions of Claude in a conversation — plan 24', () => {
    /** The `AskUserQuestion` of the recording, and the first label of each of its questions. */
    const QUESTION = 'toolu_01GpjZVmiX4rEFumRubJuXzV';

    beforeEach(async () => {
      const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
      await db.execute(sql`TRUNCATE TABLE "permission_requests"`);
    });

    /** A conversation in which Claude asked three questions. */
    function asked(n: number): string {
      const id = conversationId(n);
      store.add({
        sessionId: id,
        directory: allowlist.root,
        cwd: allowlist.root,
        lastModified: (written += 1_000),
        messages: capturedTranscript('question-turn'),
      });
      return id;
    }

    /** What this backend recorded of the question, as the permission flow writes it. */
    async function recorded(
      row: {
        status: 'pending' | 'resolved' | 'expired';
        decision?: 'allow' | 'deny';
        reason?: string;
        answers?: unknown;
        auto?: boolean;
        subject?: string;
      },
      requestedAt = '2026-10-08T10:00:00.000Z',
    ): Promise<void> {
      const db = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT).db;
      await db.execute(sql`
        INSERT INTO "permission_requests"
          ("id", "user_id", "session_id", "tool_use_id", "tool_name", "input", "risk_hint", "status",
           "decision", "reason", "auto", "answers", "requested_at", "expires_at")
        VALUES
          (${`req-${requestedAt}`}, ${row.subject ?? SUBJECT}, '01J0ABCDEFGHJKMNPQRSTVWXYZ',
           ${QUESTION}, 'AskUserQuestion', '{}'::jsonb, 'read', ${row.status},
           ${row.decision ?? null}, ${row.reason ?? null}, ${row.auto ?? null},
           ${row.answers === undefined ? null : JSON.stringify(row.answers)}::jsonb,
           ${requestedAt}::timestamptz, ${requestedAt}::timestamptz + interval '10 minutes')
      `);
    }

    /** The `question` the end of the `AskUserQuestion` carries. */
    async function questionOf(id: string): Promise<Record<string, unknown> | undefined> {
      const response = await read(id, { limit: '100' });
      expect(response.status).toBe(200);
      const events = response.body.events as { type: string; payload: Record<string, unknown> }[];
      const end = events.find(
        (event) => event.type === 'tool.completed' && event.payload['toolUseId'] === QUESTION,
      );
      return end?.payload['question'] as Record<string, unknown> | undefined;
    }

    const ANSWERS = [
      { questionId: 'q1', selected: ['Installation'] },
      { questionId: 'q2', selected: ['Classic prose'] },
      { questionId: 'q3', selected: [], other: 'friendly' },
    ];

    it('carries the answers recorded here, matched by the tool call — S-98', async () => {
      const id = asked(90);
      await recorded({ status: 'resolved', decision: 'allow', answers: ANSWERS });

      const question = await questionOf(id);

      expect(question).toMatchObject({ outcome: 'answered', answers: ANSWERS });
      expect(question?.['interaction']).toMatchObject({ kind: 'question', malformed: false });
      expect(
        (question?.['interaction'] as { questions: { id: string }[] }).questions.map((q) => q.id),
      ).toEqual(['q1', 'q2', 'q3']);
    });

    it('with no record here, carries the questions alone, and the summary stays — S-99', async () => {
      const id = asked(91);
      // Somebody else's answer to the same call is not theirs to see.
      await recorded({ status: 'resolved', decision: 'allow', answers: ANSWERS, subject: OTHER });

      const response = await read(id, { limit: '100' });
      const events = response.body.events as { type: string; payload: Record<string, unknown> }[];
      const end = events.find(
        (event) => event.type === 'tool.completed' && event.payload['toolUseId'] === QUESTION,
      );

      expect(end?.payload['question']).toMatchObject({ interaction: { kind: 'question' } });
      expect(end?.payload['question']).not.toHaveProperty('outcome');
      expect(end?.payload['question']).not.toHaveProperty('answers');
      expect(String(end?.payload['summary'])).toContain('Your questions have been answered');
    });

    it('says a refused question was refused, with its reason — S-101', async () => {
      const id = asked(92);
      await recorded({ status: 'resolved', decision: 'deny', reason: 'Not now.' });

      expect(await questionOf(id)).toMatchObject({ outcome: 'declined', reason: 'Not now.' });
    });

    it('says a question nobody answered in time ran out — S-101', async () => {
      const id = asked(93);
      await recorded({ status: 'expired', decision: 'deny', auto: true });

      const question = await questionOf(id);

      expect(question).toMatchObject({ outcome: 'expired' });
      expect(question).not.toHaveProperty('answers');
    });

    it('takes the latest record of a call asked about twice — S-98', async () => {
      const id = asked(94);
      await recorded(
        { status: 'expired', decision: 'deny', auto: true },
        '2026-10-08T10:00:00.000Z',
      );
      await recorded(
        { status: 'resolved', decision: 'allow', answers: ANSWERS },
        '2026-10-08T10:05:00.000Z',
      );

      expect(await questionOf(id)).toMatchObject({ outcome: 'answered' });
    });

    it('leaves every other tool as it was', async () => {
      const id = conversation(95);

      const response = await read(id);
      const events = response.body.events as { type: string; payload: Record<string, unknown> }[];

      expect(events.some((event) => 'question' in event.payload)).toBe(false);
    });
  });

  it('logs both sides of the edge, and never a word of the conversation — S-72', async () => {
    const id = conversation(1, { turns: 2 });
    harness.log.lines.length = 0;

    await list();
    await read(id);

    const reads = harness.log.withOp('claude.transcript.read');
    const written = JSON.stringify(harness.log.lines);

    expect(reads.length).toBeGreaterThanOrEqual(3);
    expect(harness.log.withOp('claude.transcript.messages')[0]).toMatchObject({
      claudeSessionId: id,
      cache: 'miss',
    });
    // The fixture's own words: the notes it read, and the file it wrote.
    expect(written).not.toContain('two goals');
    expect(written).not.toContain('safety and speed');
  });
});
