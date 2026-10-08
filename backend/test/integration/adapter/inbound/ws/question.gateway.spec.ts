import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { waitFor } from '../../../../support/app/wait-for';

/**
 * The deadline of a question in this suite — and a permission's, far longer, so a request that
 * expires in time is visibly a question's (D-07).
 */
const QUESTION_TIMEOUT_MS = 1_500;
const EXTENSION_MS = 3_000;

/** The labels the recorded `AskUserQuestion` of `plan-turn` offers, in order. */
const LITERAL = "Describe only what's true (Recommended)";
const INTENDED = 'Frame it as a starting point';

/**
 * A question of Claude, answered over the real socket (plan 24, F1).
 *
 * The recorded `plan-turn` asks one `AskUserQuestion` before anything else — one single-choice
 * question of three options — and that is the request every case here starts from. What is proved is
 * the server's half: the question is published normalised, a wrong answer is refused with the
 * request still open, a right one is settled, recorded, audited and published with what was chosen.
 */
describe('a question of Claude, over the socket', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let connection: DatabaseConnection;
  let root: string;
  let scripted: ReturnType<typeof scriptedSdk>;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    connection = openDatabase(database.url);

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    scripted = scriptedSdk({ fixture: 'plan-turn' });

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
      {
        RC_PERMISSION_TIMEOUT_MS: '60000',
        RC_QUESTION_TIMEOUT_MS: String(QUESTION_TIMEOUT_MS),
        RC_PERMISSION_EXTENSION_MS: String(EXTENSION_MS),
        RC_PERMISSION_MAX_EXTENSIONS: '1',
      },
    );
  });

  afterEach(async () => {
    for (const { socket, sessionId } of started.splice(0)) {
      if (!socket.isOpen) {
        continue;
      }

      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, 'session.closed').catch(() => undefined);
    }
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await connection.pool.end();
    await identity.stop();
    await database.stop();
  });

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

  async function until(socket: TestSocket, type: string, limit = 800): Promise<Envelope> {
    const seen: string[] = [];

    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      seen.push(
        `${frame.type}${frame.kind === 'error' ? `(${String(frame.payload?.['code'])})` : ''}`,
      );

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in: ${seen.join(', ')}`);
  }

  /** Opens a session and prompts it, stopping at the first request the recording asks. */
  async function asked(
    socket: TestSocket,
    prompt = 'plan the readme',
  ): Promise<{ sessionId: string; request: Envelope; requestId: string }> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();

    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    socket.send(commandFrame('session.prompt', { sessionId, text: prompt }));
    const request = await until(socket, 'permission.requested');

    return { sessionId, request, requestId: String(request.payload?.['requestId']) };
  }

  function answer(socket: TestSocket, requestId: string, extra: Record<string, unknown>): void {
    socket.send(commandFrame('permission.resolve', { requestId, ...extra }));
  }

  /** The row the history kept for a request. */
  async function history(requestId: string) {
    const rows = await connection.db.execute<{
      status: string;
      decision: string | null;
      scope: string | null;
      reason: string | null;
      answers: unknown;
      expires_at: string;
      requested_at: string;
    }>(
      sql`SELECT "status", "decision", "scope", "reason", "answers", "expires_at", "requested_at"
          FROM "permission_requests" WHERE "id" = ${requestId}`,
    );

    return rows.rows[0] ?? null;
  }

  /**
   * The trail of one invocation, oldest first. By session too: the replay reuses the recording's
   * tool ids in every session it opens.
   */
  async function trail(sessionId: string, toolUseId: string) {
    const rows = await connection.db.execute<{ decision: string; input: Record<string, unknown> }>(
      sql`SELECT "decision", "input" FROM "audit_entries"
          WHERE "session_id" = ${sessionId} AND "tool_use_id" = ${toolUseId} ORDER BY "seq"`,
    );

    return rows.rows;
  }

  /**
   * What `canUseTool` handed the SDK back for a request — read off the fake's record, since the
   * replay goes on with what was recorded whatever the answer (D-19).
   */
  async function verdictsOf(requestId: string): Promise<unknown[]> {
    const found = await waitFor(
      'the SDK to be answered',
      () =>
        Promise.resolve(scripted.record.verdicts.filter((each) => each.requestId === requestId)),
      (verdicts) => verdicts.length > 0,
    );

    return found.map((each) => each.result);
  }

  /** The text of the question the recording asks — the key the SDK's answers go under. */
  const promptOf = (request: Envelope): string =>
    String(
      (request.payload?.['input'] as { questions: { question: string }[] }).questions[0]?.question,
    );

  /** The error frame an answer earned. */
  async function refusal(socket: TestSocket): Promise<Readonly<Record<string, unknown>>> {
    return (await until(socket, 'error')).payload ?? {};
  }

  it('publishes the question normalised, as a request nobody can mistake for a permission — S-24', async () => {
    const { request } = await asked(await connect());

    expect(request.payload).toMatchObject({
      toolName: 'AskUserQuestion',
      title: 'permission.tool.AskUserQuestion',
      riskHint: 'read',
      defaultToNo: false,
      suggestions: [],
      reaches: [],
      interaction: {
        kind: 'question',
        malformed: false,
        questions: [
          {
            id: 'q1',
            header: 'README angle',
            multiSelect: false,
            options: [
              { label: LITERAL, preview: expect.any(String) },
              { label: INTENDED, preview: expect.any(String) },
              { label: "I'll tell you the purpose" },
            ],
          },
        ],
      },
    });
    expect(request.payload?.['description']).toBeUndefined();
  });

  it('gives a question its own deadline — S-25', async () => {
    const { requestId } = await asked(await connect());
    const row = await history(requestId);

    expect(row).not.toBeNull();
    expect(new Date(row!.expires_at).getTime() - new Date(row!.requested_at).getTime()).toBe(
      QUESTION_TIMEOUT_MS,
    );
  });

  describe('answers that do not fit — B-05', () => {
    it('refuses an allow with no answers, and keeps the question open — S-15, S-23, S-43', async () => {
      const socket = await connect();
      const { requestId } = await asked(socket);

      // What an old client sends from the generic card.
      answer(socket, requestId, { decision: 'allow', scope: 'once' });

      expect(await refusal(socket)).toMatchObject({
        code: 'PERMISSION_ANSWERS_INVALID',
        messageKey: 'permission.error.answersInvalid',
        httpEquivalent: 422,
        details: [{ field: 'answers', rule: 'answersRequired' }],
      });
      expect(await history(requestId)).toMatchObject({ status: 'pending', decision: null });

      // Still open, so a right answer right after settles it.
      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });
      expect((await until(socket, 'permission.resolved')).payload).toMatchObject({
        requestId,
        decision: 'allow',
      });
    });

    it('refuses a label that is not an option, without echoing it — S-16', async () => {
      const socket = await connect();
      const { requestId } = await asked(socket);

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: ['a secret of mine'] }],
      });

      const refused = await refusal(socket);
      expect(refused).toMatchObject({
        code: 'PERMISSION_ANSWERS_INVALID',
        details: [{ field: 'answers.q1', rule: 'unknownOption' }],
      });
      expect(JSON.stringify(refused)).not.toContain('secret');
    });

    it('refuses a free answer of spaces, and takes one of 2000 characters — S-22', async () => {
      const socket = await connect();
      const { requestId } = await asked(socket);

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [], other: '   ' }],
      });
      expect(await refusal(socket)).toMatchObject({
        code: 'PERMISSION_ANSWERS_INVALID',
        details: [{ field: 'answers.q1', rule: 'otherBlank' }],
      });

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [], other: 'o'.repeat(2_001) }],
      });
      expect(await refusal(socket)).toMatchObject({ code: 'INVALID_INPUT' });

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [], other: 'o'.repeat(2_000) }],
      });
      await until(socket, 'permission.resolved');
      expect(await history(requestId)).toMatchObject({
        answers: [{ questionId: 'q1', selected: [], other: 'o'.repeat(2_000) }],
      });
    });

    it('refuses answers on a request that is not a question — S-20', async () => {
      const socket = await connect();
      const { requestId, request } = await asked(socket, 'do the work [fixture:tool-turn]');
      expect(request.payload?.['toolName']).not.toBe('AskUserQuestion');

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: ['Yes'] }],
      });

      expect(await refusal(socket)).toMatchObject({
        code: 'PERMISSION_ANSWERS_INVALID',
        details: [{ field: 'answers', rule: 'notAQuestion' }],
      });
      expect(await history(requestId)).toMatchObject({ status: 'pending' });
    });

    it('refuses answers shaped wrong at the schema — S-02', async () => {
      const socket = await connect();
      const { requestId } = await asked(socket);

      for (const answers of [
        Array.from({ length: 5 }, (_, index) => ({
          questionId: `q${String(index)}`,
          selected: [],
        })),
        [{ questionId: 'q1', selected: ['a', 'b', 'c', 'd', 'e'] }],
        [{ questionId: 7, selected: [LITERAL] }],
      ]) {
        answer(socket, requestId, { decision: 'allow', answers });
        expect(await refusal(socket)).toMatchObject({ code: 'INVALID_INPUT' });
      }
    });
  });

  describe('answers that fit — B-08', () => {
    it('settles, records, and tells every connection what was chosen — S-35', async () => {
      const answering = await connect();
      const watching = await connect();
      const { sessionId, requestId } = await asked(answering);

      watching.send(commandFrame('session.attach', { sessionId }));
      await until(watching, 'session.attached');

      answer(answering, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [], other: 'a tally CLI, for real' }],
      });

      for (const socket of [answering, watching]) {
        expect((await until(socket, 'permission.resolved')).payload).toMatchObject({
          requestId,
          decision: 'allow',
          auto: false,
          resolvedBy: SUBJECT,
          answers: [{ questionId: 'q1', selected: [], other: 'a tally CLI, for real' }],
        });
      }
      expect(await history(requestId)).toMatchObject({
        status: 'resolved',
        scope: 'once',
        answers: [{ questionId: 'q1', selected: [], other: 'a tally CLI, for real' }],
      });
    });

    it('writes the answers on the decision of the trail, and leaves the hook`s entry alone — S-36', async () => {
      const socket = await connect();
      const { sessionId, requestId, request } = await asked(socket);
      const toolUseId = String(request.payload?.['toolUseId']);

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [INTENDED] }],
      });
      await until(socket, 'permission.resolved');

      const entries = await waitFor(
        'the decision to reach the trail',
        () => trail(sessionId, toolUseId),
        (rows) => rows.some((row) => row.decision === 'allowed'),
      );
      const recorded = entries.find((row) => row.decision === 'recorded');
      const allowed = entries.find((row) => row.decision === 'allowed');

      expect(recorded?.input['answers']).toBeUndefined();
      expect(allowed?.input).toMatchObject({
        questions: expect.any(Array),
        answers: [{ questionId: 'q1', selected: [INTENDED] }],
      });
    });

    it('logs that a question was answered without what, and what only in debug — S-37', async () => {
      const socket = await connect();
      const { requestId } = await asked(socket);

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [], other: 'private words' }],
      });
      await until(socket, 'permission.resolved');

      const lines = await waitFor(
        'the answer to be logged',
        () => Promise.resolve(harness.log.withOp('permission.question.answered')),
        (found) => found.some((line) => line['requestId'] === requestId),
      );
      const mine = lines.filter((line) => line['requestId'] === requestId);
      const info = mine.find((line) => line.level === 'info');
      const debug = mine.find((line) => line.level === 'debug');

      expect(info).toMatchObject({ questions: 1, withOther: true });
      expect(JSON.stringify(info)).not.toContain('private');
      expect(JSON.stringify(debug)).toContain('private words');
    });

    it('hands the SDK the questions it asked, with the answers in its shape — S-58', async () => {
      const socket = await connect();
      const { requestId, request } = await asked(socket);

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [], other: 'a counter, one day' }],
      });
      await until(socket, 'permission.resolved');

      expect(await verdictsOf(requestId)).toEqual([
        {
          behavior: 'allow',
          updatedInput: {
            ...(request.payload?.['input'] as object),
            answers: { [promptOf(request)]: 'a counter, one day' },
          },
        },
      ]);
    });

    it('lets the first of two different answers win, and acks the second — S-38', async () => {
      const first = await connect();
      const second = await connect();
      const { sessionId, requestId, request } = await asked(first);

      second.send(commandFrame('session.attach', { sessionId }));
      await until(second, 'session.attached');

      answer(first, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });
      answer(second, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [INTENDED] }],
      });

      expect((await until(second, 'permission.resolved')).payload).toMatchObject({
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });
      expect((await until(second, 'command.accepted')).kind).toBe('ack');
      expect(await history(requestId)).toMatchObject({
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });
      // One answer reached the SDK, and it is the one that won.
      expect(await verdictsOf(requestId)).toEqual([
        expect.objectContaining({
          updatedInput: expect.objectContaining({ answers: { [promptOf(request)]: LITERAL } }),
        }),
      ]);
    });

    it('takes the same answer sent twice as one — S-39', async () => {
      const socket = await connect();
      const { sessionId, requestId, request } = await asked(socket);
      const answers = [{ questionId: 'q1', selected: [LITERAL] }];

      answer(socket, requestId, { decision: 'allow', answers });
      await until(socket, 'permission.resolved');
      answer(socket, requestId, { decision: 'allow', answers });
      expect((await until(socket, 'command.accepted')).kind).toBe('ack');

      const decisions = await waitFor(
        'the decision to reach the trail',
        () => trail(sessionId, String(request.payload?.['toolUseId'])),
        (rows) => rows.some((row) => row.decision === 'allowed'),
      );
      expect(decisions.filter((row) => row.decision === 'allowed')).toHaveLength(1);
    });

    it('treats scope and reach on a question as once, and leaves no rule — S-28', async () => {
      const socket = await connect();
      const { requestId } = await asked(socket);

      answer(socket, requestId, {
        decision: 'allow',
        scope: 'always',
        reach: 'tool',
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });
      await until(socket, 'permission.resolved');

      expect(await history(requestId)).toMatchObject({ scope: 'once' });
      const rules = await connection.db.execute(
        sql`SELECT 1 FROM "permission_rules" WHERE "pattern" LIKE 'AskUserQuestion%'`,
      );
      expect(rules.rows).toHaveLength(0);
    });

    it('refuses with the reason given, or the one the client sends for nothing — S-45', async () => {
      for (const reason of ['not now, ask me later', 'The user chose not to answer.']) {
        const socket = await connect();
        const { requestId } = await asked(socket);

        answer(socket, requestId, { decision: 'deny', reason });

        const resolved = await until(socket, 'permission.resolved');
        expect(resolved.payload).toMatchObject({ decision: 'deny' });
        expect(resolved.payload?.['answers']).toBeUndefined();
        expect(await history(requestId)).toMatchObject({ decision: 'deny', reason, answers: null });
      }
    });

    it('refuses an answer from a connection not watching the session — S-41', async () => {
      const owner = await connect();
      const stranger = await connect();
      const { requestId } = await asked(owner);

      answer(stranger, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });

      expect(await refusal(stranger)).toMatchObject({ code: 'PERMISSION_NOT_OWNED' });
    });

    it('republishes the open question with its interaction, and replays it answered — S-42', async () => {
      const first = await connect();
      const { sessionId, requestId } = await asked(first);

      const reconnected = await connect();
      reconnected.send(commandFrame('session.attach', { sessionId }));
      await until(reconnected, 'session.attached');
      expect((await until(reconnected, 'permission.requested')).payload).toMatchObject({
        requestId,
        interaction: { kind: 'question' },
      });

      answer(first, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });
      await until(first, 'permission.resolved');

      const late = await connect();
      late.send(commandFrame('session.attach', { sessionId, resumeFromSeq: 0 }));
      expect((await until(late, 'permission.resolved')).payload).toMatchObject({
        requestId,
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });
    });
  });

  describe('a question nobody answers', () => {
    it('extends by the same step, to the same ceiling — S-27', async () => {
      const socket = await connect();
      const { requestId, request } = await asked(socket);

      socket.send(commandFrame('permission.extend', { requestId }));
      const extended = await until(socket, 'permission.extended');
      expect(extended.payload).toMatchObject({ requestId, remainingExtensions: 0 });
      expect(new Date(String(extended.payload?.['expiresAt'])).getTime()).toBeGreaterThan(
        new Date(String(request.payload?.['expiresAt'])).getTime(),
      );

      socket.send(commandFrame('permission.extend', { requestId }));
      // The same refusal as any request at its ceiling.
      expect(await refusal(socket)).toMatchObject({
        code: 'INVALID_INPUT',
        messageKey: 'permission.error.extensionLimitReached',
      });
    });

    it('expires as any request does, and acks a late answer — S-40, S-50', async () => {
      const socket = await connect();
      const { requestId } = await asked(socket);

      expect((await until(socket, 'permission.resolved')).payload).toMatchObject({
        requestId,
        decision: 'deny',
        auto: true,
      });
      expect(await history(requestId)).toMatchObject({ status: 'expired', answers: null });
      // Claude is told the question went unanswered — and not to take the silence for an answer.
      expect(await verdictsOf(requestId)).toEqual([
        {
          behavior: 'deny',
          message: 'The user did not answer in time. Do not assume an answer; ask again or stop.',
        },
      ]);

      answer(socket, requestId, {
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      });
      expect((await until(socket, 'command.accepted')).kind).toBe('ack');
      expect(await history(requestId)).toMatchObject({ status: 'expired' });
    });

    it('expires when its session ends, and every connection is told — S-51', async () => {
      const socket = await connect();
      const watching = await connect();
      const { sessionId, requestId } = await asked(socket);

      watching.send(commandFrame('session.attach', { sessionId }));
      await until(watching, 'session.attached');

      socket.send(commandFrame('session.close', { sessionId }));

      for (const each of [socket, watching]) {
        expect((await until(each, 'permission.resolved')).payload).toMatchObject({
          requestId,
          decision: 'deny',
          auto: true,
        });
      }
    });
  });

  describe('rules and questions — B-07', () => {
    async function ruleFor(decision: 'allow' | 'deny'): Promise<void> {
      // Stored directly: the API refuses an allow for a tool that asks the person, and this is one
      // left from before that rule existed.
      await connection.db.execute(
        sql`INSERT INTO "permission_rules"
              ("id", "user_id", "scope", "project_path", "pattern", "decision", "granted_at",
               "expires_at")
            VALUES (${`rule-${decision}-${String(Date.now())}`}, ${SUBJECT}, 'always', NULL,
                    'AskUserQuestion', ${decision}, now(), now() + interval '1 day')`,
      );
    }

    afterEach(async () => {
      await connection.db.execute(
        sql`DELETE FROM "permission_rules" WHERE "pattern" = 'AskUserQuestion'`,
      );
    });

    it('ignores an allow already recorded, asks the person, and says so in debug — S-29', async () => {
      await ruleFor('allow');
      const { requestId, request } = await asked(await connect());

      expect(request.payload).toMatchObject({ toolName: 'AskUserQuestion' });
      expect(
        harness.log
          .withOp('permission.rule.lookup')
          .some((line) => line.level === 'debug' && line['requestId'] === requestId),
      ).toBe(true);
    });

    it('lets a deny refuse by itself — S-30', async () => {
      await ruleFor('deny');
      const socket = await connect();

      socket.send(commandFrame('session.start', { workspacePath: root }));
      await socket.next();
      const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
      started.push({ socket, sessionId });
      socket.send(commandFrame('session.prompt', { sessionId, text: 'plan the readme' }));

      expect((await until(socket, 'permission.resolved')).payload).toMatchObject({
        decision: 'deny',
        auto: true,
        via: 'rule',
      });
    });
  });
});
