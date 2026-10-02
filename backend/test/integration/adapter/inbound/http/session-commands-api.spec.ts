import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { BUNDLED_CLI_VERSION } from '@adapter/outbound/claude/cli-version';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { loadCommands } from '../../../../fakes/agent-sdk/fixture';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions, ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/** What the container believes the SDK ships — deliberately not what the recorded CLI reports. */
const BUNDLED = '0.0.0-bundled';

/** A ULID nobody has opened a session with. */
const NOBODY = '01J0ZZZZZZZZZZZZZZZZZZZZZZ';

/**
 * The slash commands of the installation, over the real gateway — plan 04, F3.
 *
 * The menu is asked the way a client asks it: a session opened on a real socket, then
 * `GET /sessions/:sessionId/commands` with a bearer token, against the real container. The CLI is
 * the recorded one: its catalogue is what `supportedCommands()` answered on a real installation, and
 * the `/init` turn is a real run of `/init` — the command exploring a project and asking to write.
 */
describe('the slash commands of a session', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let script: ScriptOptions;

  const records: ScriptRecord[] = [];
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();

    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    // A fresh scripted run per session, following whatever the current test asked the CLI to be.
    const createQuery: QueryFactory = (params) => {
      const scripted = scriptedSdk(script);
      records.push(scripted.record);
      return scripted.createQuery(params);
    };

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(createQuery)
          .overrideProvider(BUNDLED_CLI_VERSION)
          .useValue(BUNDLED),
      allowlist,
      // Long enough that a turn replaying the whole recorded `/init` still has time to be answered.
      {
        RC_PERMISSION_TIMEOUT_MS: '5000',
        // Every test opens its own sessions and leaves them running; the limit has scenarios of its
        // own (plan 01, S-88), and here it would only make the last tests depend on the first ones.
        RC_SESSION_MAX_CONCURRENT: '32',
      },
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

  beforeEach(() => {
    script = { fixture: 'text-turn' };
    records.length = 0;
  });

  /** Calls made to `supportedCommands()`, across every session of the test. */
  const calls = (): number => records.reduce((sum, record) => sum + record.commandCalls, 0);

  /**
   * A workspace of the test's own, inside the allowed root.
   *
   * The catalogue is one per process and keyed by workspace, so each test gets a directory nobody
   * else asked about — otherwise the second test would be reading the first one's cache.
   */
  function workspace(name: string): string {
    const directory = path.join(root, name);
    mkdirSync(directory, { recursive: true });
    return directory;
  }

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

  async function until(socket: TestSocket, type: string, limit = 400): Promise<Envelope> {
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();

      if (frame.type === type) {
        return frame;
      }
    }

    throw new Error(`no ${type} in ${String(limit)} frames`);
  }

  async function started(socket: TestSocket, directory: string): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: directory }));
    return String((await until(socket, 'session.started')).payload?.['sessionId']);
  }

  const menu = (sessionId: string, bearer: string = token) =>
    request(harness.app.getHttpServer())
      .get(`/sessions/${sessionId}/commands`)
      .set('Authorization', `Bearer ${bearer}`);

  it('lists what the installation offers, without the dead and the internal — S-29, S-60', async () => {
    const socket = await connect();
    const sessionId = await started(socket, workspace('s29'));

    const response = await menu(sessionId);
    const names = (response.body as { commands: { name: string }[] }).commands.map(
      (command) => command.name,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ cliVersion: BUNDLED });
    expect(names).toHaveLength(loadCommands().commands.length - 3);
    expect(names).not.toContain('agents');
    expect(names).not.toContain('extra-usage');
    expect(names).not.toContain('__remote-workflow');
    expect((response.body as { commands: unknown[] }).commands[0]).toMatchObject({
      name: 'init',
      suggested: true,
    });
    expect(calls()).toBe(1);
  });

  it('shows fewer commands for an installation that has fewer — S-30', async () => {
    script = {
      fixture: 'text-turn',
      commands: [{ name: 'zeta', description: 'The only one', argumentHint: '' }],
    };
    const socket = await connect();
    const sessionId = await started(socket, workspace('s30'));

    const response = await menu(sessionId);

    expect(response.body).toEqual({
      cliVersion: BUNDLED,
      commands: [
        {
          name: 'zeta',
          description: 'The only one',
          argumentHint: '',
          aliases: [],
          builtin: false,
          suggested: false,
          origin: 'project',
          label: 'zeta',
          shadowed: false,
        },
      ],
    });
  });

  it('answers 502 when the CLI cannot list, and the prompt still goes through — S-31', async () => {
    script = { fixture: 'text-turn', commands: new Error('the subprocess is unhappy') };
    const socket = await connect();
    const sessionId = await started(socket, workspace('s31'));

    const response = await menu(sessionId);

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      error: { code: 'CLAUDE_UNAVAILABLE', messageKey: 'session.error.claudeUnavailable' },
    });

    // The menu is discovery, not a boundary: without a list nothing is refused, not even a
    // command nobody could check.
    socket.send(commandFrame('session.prompt', { sessionId, text: '/anything at all' }));
    await until(socket, 'turn.completed');
    expect(records[0]?.prompts).toEqual(['/anything at all']);
  });

  it('refuses a command the installation does not have, translated and to its sender — S-34', async () => {
    const socket = await connect();
    const sessionId = await started(socket, workspace('s34'));
    const prompt = commandFrame('session.prompt', { sessionId, text: '/heapsnap now' });

    socket.send(prompt);
    const refusal = await until(socket, 'error');

    expect(refusal.correlationId).toBe(prompt['id']);
    expect(refusal.payload).toMatchObject({
      code: 'INVALID_INPUT',
      messageKey: 'session.error.unknownCommand',
      params: { command: 'heapsnap' },
    });
    expect(records[0]?.prompts).toEqual([]);
  });

  it('acks every prompt before any event of its turn, even in a burst — the ordering rule', async () => {
    // Checking a command can wait on the CLI, and handing the prompt over during the check let the
    // first events of a turn overtake the ack of the prompt that caused them. The client that reads
    // `seq` off the last frame then saw zero, and an e2e suite ran out of memory over it.
    const socket = await connect();
    const sessionId = await started(socket, workspace('ordering'));
    const burst = 5;

    for (let index = 0; index < burst; index += 1) {
      socket.send(commandFrame('session.prompt', { sessionId, text: `/init ${String(index)}` }));
    }

    const frames: Envelope[] = [];
    while (frames.filter((frame) => frame.type === 'turn.completed').length < burst) {
      frames.push(await socket.next());
    }

    const acks = frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => frame.type === 'command.accepted');
    const firstEvent = frames.findIndex((frame) => frame.kind === 'event');

    expect(acks).toHaveLength(burst);
    expect(acks[0]?.index).toBeLessThan(firstEvent);
    expect(records[0]?.prompts).toEqual(
      Array.from({ length: burst }, (_, index) => `/init ${String(index)}`),
    );
  });

  it('asks once per installation, and again when the CLI reports another version — S-35', async () => {
    const directory = workspace('s35');
    const socket = await connect();
    const first = await started(socket, directory);
    const second = await started(socket, directory);

    await menu(first);
    await menu(second);
    expect(calls()).toBe(1);

    // A turn makes the CLI report itself in `system:init` — the recorded 2.1.277, not the version
    // the container was told the SDK ships. From then on the menu is the other installation's.
    socket.send(commandFrame('session.prompt', { sessionId: second, text: 'hello' }));
    await until(socket, 'turn.completed');
    const after = await menu(second);

    expect(after.body).toMatchObject({ cliVersion: '2.1.277' });
    expect(calls()).toBe(2);
  });

  it('makes one call for two sessions asking together — S-36', async () => {
    const directory = workspace('s36');
    const socket = await connect();
    const first = await started(socket, directory);
    const second = await started(socket, directory);

    const [left, right] = await Promise.all([menu(first), menu(second)]);

    expect(left.body).toEqual(right.body);
    expect(calls()).toBe(1);
  });

  it("answers 403 for somebody else's session, 404 for none and 400 for a malformed id", async () => {
    const socket = await connect();
    const sessionId = await started(socket, workspace('owners'));
    const stranger = await identity.accessToken({ subject: 'auth|stranger' });

    expect((await menu(sessionId, stranger)).status).toBe(403);
    expect((await menu(NOBODY)).status).toBe(404);
    expect((await menu('not-a-session')).status).toBe(400);
    expect(
      (await request(harness.app.getHttpServer()).get(`/sessions/${sessionId}/commands`)).status,
    ).toBe(401);
  });

  it('runs `/init` as a prompt, and its `Write` asks the human — S-32, S-33', async () => {
    const socket = await connect();
    const sessionId = await started(socket, workspace('init'));
    const asked: string[] = [];

    socket.send(commandFrame('session.prompt', { sessionId, text: '/init [fixture:init-turn]' }));

    // Every question of the recorded run is answered yes, as a person would; the turn only ends
    // because the answers arrived.
    for (let taken = 0; taken < 1_000; taken += 1) {
      const frame = await socket.next();

      if (frame.type === 'error') {
        throw new Error(`the /init turn failed: ${JSON.stringify(frame.payload)}`);
      }

      if (frame.type === 'permission.requested') {
        asked.push(String(frame.payload?.['toolName']));
        socket.send(
          commandFrame(
            'permission.resolve',
            { requestId: frame.payload?.['requestId'], decision: 'allow' },
            { kind: 'response', correlationId: frame.id },
          ),
        );
      }

      if (frame.type === 'turn.completed') {
        break;
      }
    }

    expect(records[0]?.prompts).toEqual(['/init [fixture:init-turn]']);
    expect(asked).toContain('Write');
    expect(records[0]?.hooked).toContain('Write');
  });
});
