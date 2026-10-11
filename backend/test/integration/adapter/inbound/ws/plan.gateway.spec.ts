import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';
import { isPermissionRequestedPayload } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';
import { waitFor } from '../../../../support/app/wait-for';

/** The label of the recorded question's first option — answered to reach the plan behind it. */
const LITERAL = "Describe only what's true (Recommended)";

/** Where the recorded run saved its plan. */
const PLAN_FILE = '/home/user/.claude/plans/plan-how-you-would-glittery-steele.md';

/**
 * The plan of the agent, approved over the real socket (plan 28, B-20).
 *
 * The recorded `plan-turn` asks one question and then presents its plan with `ExitPlanMode` — the
 * second request of every case here. What is proved is the server's half: the plan travels as an
 * interaction of its own (`kind: 'plan'`, the markdown, the file), approving it is a
 * `permission.resolve` that the first answer wins, and the mode the session goes on in is the
 * client's next command, which reaches the engine (S-61…S-63).
 */
describe('the plan of the agent, over the socket', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let scripted: ReturnType<typeof scriptedSdk>;
  const open: TestSocket[] = [];
  const started: { socket: TestSocket; sessionId: string }[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    scripted = scriptedSdk({ fixture: 'plan-turn' });

    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
      { RC_PERMISSION_TIMEOUT_MS: '60000', RC_QUESTION_TIMEOUT_MS: '60000' },
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

  /** Opens a session, prompts it, answers its question, and stops at the plan it presents. */
  async function planned(
    socket: TestSocket,
  ): Promise<{ sessionId: string; plan: Envelope; requestId: string }> {
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();

    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });

    socket.send(commandFrame('session.prompt', { sessionId, text: 'plan the readme' }));
    const question = await until(socket, 'permission.requested');
    socket.send(
      commandFrame('permission.resolve', {
        requestId: String(question.payload?.['requestId']),
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: [LITERAL] }],
      }),
    );

    const plan = await until(socket, 'permission.requested');
    return { sessionId, plan, requestId: String(plan.payload?.['requestId']) };
  }

  /** What answers a request of the recorded run so it goes on: the question's option, the plan's yes. */
  function approval(request: Envelope): Record<string, unknown> {
    const requestId = String(request.payload?.['requestId']);
    return request.payload?.['kind'] === 'question'
      ? { requestId, decision: 'allow', answers: [{ questionId: 'q1', selected: [LITERAL] }] }
      : { requestId, decision: 'allow' };
  }

  /** Every call started in the turn, every request on the way answered so the run goes on. */
  async function startsOfTurn(socket: TestSocket): Promise<Envelope[]> {
    const starts: Envelope[] = [];
    for (
      let frame = await socket.next();
      frame.type !== 'turn.completed';
      frame = await socket.next()
    ) {
      if (frame.type === 'tool.started') {
        starts.push(frame);
      } else if (frame.type === 'permission.requested') {
        socket.send(commandFrame('permission.resolve', approval(frame)));
      }
    }
    return starts;
  }

  /** What `canUseTool` handed the SDK back for a request. */
  async function verdictsOf(requestId: string): Promise<unknown[]> {
    const found = await waitFor(
      'the SDK to be answered',
      () =>
        Promise.resolve(scripted.record.verdicts.filter((each) => each.requestId === requestId)),
      (verdicts) => verdicts.length > 0,
    );

    return found.map((each) => each.result);
  }

  it('publishes the plan as an interaction of its own: markdown, file, refusal first — S-61', async () => {
    const { plan } = await planned(await connect());

    expect(plan.payload).toMatchObject({
      kind: 'plan',
      title: 'permission.tool.plan',
      defaultToNo: true,
      suggestions: [],
      reaches: [],
      interaction: {
        kind: 'plan',
        markdown: expect.stringMatching(/^# Add a two-line README\.md/),
        path: PLAN_FILE,
      },
    });
    expect(plan.payload?.['description']).toBeUndefined();
    expect(isPermissionRequestedPayload(plan.payload)).toBe(true);
  });

  it('carries the plan on the start of its call too, for the history to draw — S-61', async () => {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));
    await socket.next();
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);
    started.push({ socket, sessionId });
    socket.send(commandFrame('session.prompt', { sessionId, text: 'plan the readme' }));

    const starts = await startsOfTurn(socket);

    const plan = starts.find((frame) => frame.payload?.['kind'] === 'plan');
    expect(plan?.payload?.['interaction']).toMatchObject({
      kind: 'plan',
      markdown: expect.stringMatching(/^# Add a two-line README\.md/),
      path: PLAN_FILE,
    });
    expect(
      starts.find((frame) => frame.payload?.['kind'] === 'question')?.payload?.['interaction'],
    ).toMatchObject({ kind: 'question', malformed: false });
  });

  it('approves the plan, and the mode the client sends next reaches the engine — S-62', async () => {
    const socket = await connect();
    const { sessionId, requestId } = await planned(socket);
    const before = scripted.record.modes.length;

    socket.send(commandFrame('permission.resolve', { requestId, decision: 'allow' }));
    expect((await until(socket, 'permission.resolved')).payload).toMatchObject({
      requestId,
      decision: 'allow',
    });
    expect(await verdictsOf(requestId)).toEqual([expect.objectContaining({ behavior: 'allow' })]);

    socket.send(commandFrame('session.setPermissionMode', { sessionId, mode: 'acceptEdits' }));
    expect((await until(socket, 'command.accepted')).kind).toBe('ack');

    const modes = await waitFor(
      'the engine to be told the mode',
      () => Promise.resolve(scripted.record.modes.slice(before)),
      (told) => told.length > 0,
    );
    expect(modes).toEqual(['acceptEdits']);
  });

  it('lets the first of two approvals win, and acks the second — S-63', async () => {
    const first = await connect();
    const second = await connect();
    const { sessionId, requestId } = await planned(first);

    second.send(commandFrame('session.attach', { sessionId }));
    await until(second, 'session.attached');

    first.send(commandFrame('permission.resolve', { requestId, decision: 'allow' }));
    second.send(commandFrame('permission.resolve', { requestId, decision: 'allow' }));

    expect((await until(second, 'permission.resolved')).payload).toMatchObject({
      requestId,
      decision: 'allow',
    });
    expect((await until(second, 'command.accepted')).kind).toBe('ack');
    // One answer reached the engine.
    expect(await verdictsOf(requestId)).toHaveLength(1);
  });

  it('refuses answers on a plan, which takes none, and keeps it open — S-61', async () => {
    const socket = await connect();
    const { requestId } = await planned(socket);

    socket.send(
      commandFrame('permission.resolve', {
        requestId,
        decision: 'allow',
        answers: [{ questionId: 'q1', selected: ['A'] }],
      }),
    );

    expect((await until(socket, 'error')).payload).toMatchObject({
      code: 'PERMISSION_ANSWERS_INVALID',
    });

    socket.send(commandFrame('permission.resolve', { requestId, decision: 'allow' }));
    expect((await until(socket, 'permission.resolved')).payload).toMatchObject({ requestId });
  });
});
