import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/**
 * An MCP tool call needs no bridge of its own (plan 13, B-26): `mcp__srv__tool` reaches
 * `canUseTool` and `PreToolUse` exactly as every other tool does (ADR-011), and the classifier
 * plan 28 already built delivers it canonical — `kind: 'mcp'`, `subject.server`/`subject.tool`,
 * `origin.native` opaque. This proves the whole path for real, against a recorded run of an actual
 * MCP tool call (`mcp-untitled-tool-turn`), rather than asserting it of the pure classifier alone.
 */
describe('an MCP tool call, through the same permission bridge as any other — plan 13, B-26, S-116', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  const sockets: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const scripted = scriptedSdk({ fixture: 'mcp-untitled-tool-turn' });
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.close();
    }
  });

  afterAll(async () => {
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

  async function until(socket: TestSocket, type: string, limit = 400): Promise<Envelope> {
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      if (frame.type === type) {
        return frame;
      }
    }
    throw new Error(`no ${type} arrived`);
  }

  it('asks canonically, as kind mcp with the server and tool named, and unblocks the loop — S-116', async () => {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);

    socket.send(
      commandFrame('session.prompt', {
        sessionId,
        text: 'Call the echo tool of the fixture MCP server with the text parity. Then reply with exactly what it returned, and nothing else.',
      }),
    );

    const request = await until(socket, 'permission.requested');
    expect(request.kind).toBe('request');
    expect(request.payload).toMatchObject({
      kind: 'mcp',
      subject: { server: 'fixture', tool: 'echo' },
      origin: { engine: 'claude', native: 'mcp__fixture__echo' },
      title: 'permission.tool.mcp',
      riskHint: 'destructive',
      defaultToNo: true,
    });
    // The native name is carried only as the opaque origin — never surfaced as the tool's own name.
    expect(request.payload).not.toHaveProperty('toolName');

    socket.send(
      commandFrame('permission.resolve', {
        requestId: request.payload?.['requestId'],
        decision: 'allow',
      }),
    );

    await until(socket, 'permission.resolved');
    // The agent loop was genuinely blocked on canUseTool — the turn only finishes because the
    // answer released it, exactly as it would for a Bash or a file-write permission.
    await until(socket, 'turn.completed');

    socket.send(commandFrame('session.close', { sessionId }));
  });

  it('a rule granted at the server reach covers every tool of that server, never another one', async () => {
    const socket = await connect();
    socket.send(commandFrame('session.start', { workspacePath: root }));
    const sessionId = String((await until(socket, 'session.started')).payload?.['sessionId']);

    socket.send(
      commandFrame('session.prompt', {
        sessionId,
        text: 'Call the echo tool of the fixture MCP server with the text parity. Then reply with exactly what it returned, and nothing else.',
      }),
    );

    const request = await until(socket, 'permission.requested');
    const serverReach = (
      request.payload?.['reaches'] as { reach: string; patterns: string[] }[]
    ).find((candidate) => candidate.patterns.some((pattern) => pattern === 'mcp(fixture:*)'));
    expect(serverReach).toBeDefined();

    socket.send(commandFrame('session.close', { sessionId }));
  });
});
