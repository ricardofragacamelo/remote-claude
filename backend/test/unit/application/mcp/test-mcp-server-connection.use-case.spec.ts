import { describe, expect, it } from 'vitest';

import {
  McpEngineCapabilities,
  McpServerConnectionTesters,
  MCP_SERVER_TEST_TIMEOUT_MS,
  TestMcpServerConnectionUseCase,
} from '@application/mcp';
import type { McpServerConnectionTester } from '@application/mcp';
import { RecordAuditEventUseCase } from '@application/audit';
import {
  createMcpServerConfig,
  McpEngineNotSupportedError,
  McpServerForbiddenError,
} from '@domain/mcp';
import type { McpEngineDialect, McpServerTestOutcome } from '@domain/mcp';
import { UserId } from '@domain/auth';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryMcpServerRepository } from '../../../support/fakes/in-memory-mcp-server.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { RevealRacingMcpServerRepository } from '../../../support/fakes/reveal-racing-mcp-server.repository';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const ENGINE = 'claude';
const USER = UserId.create('auth|mcp-test-owner');
const OTHER_USER = UserId.create('auth|mcp-test-other');
const NOW = new Date('2026-10-19T12:00:00Z');

const DIALECT: McpEngineDialect = {
  engine: ENGINE,
  rejectsServerName: () => null,
  reservedEnvNames: [],
};

/** A tester a test controls by hand: what it answers, how many times, and the digest of the config asked for. */
class RecordingTester implements McpServerConnectionTester {
  calls: { readonly name: string; readonly timeoutMs: number }[] = [];
  outcome: McpServerTestOutcome = { status: 'connected', tools: [], error: null };
  failWith: Error | null = null;

  async test(config: Parameters<McpServerConnectionTester['test']>[0], timeoutMs: number) {
    this.calls.push({ name: config.name, timeoutMs });
    if (this.failWith !== null) {
      throw this.failWith;
    }
    return this.outcome;
  }
}

async function harness() {
  const repository = new InMemoryMcpServerRepository();
  const tester = new RecordingTester();
  const events = new RecordingAuditEvents();
  const useCase = new TestMcpServerConnectionUseCase({
    servers: repository,
    capabilities: new McpEngineCapabilities([ENGINE]),
    testers: new McpServerConnectionTesters([{ engine: ENGINE, tester }]),
    trail: new RecordAuditEventUseCase(events, new SequentialIds()),
    clock: new FixedClock(NOW),
    timeoutMs: MCP_SERVER_TEST_TIMEOUT_MS,
  });

  const config = createMcpServerConfig(
    { name: 'docs', scope: 'user', folderPath: null, transport: 'stdio', command: 'npx' },
    DIALECT,
  );
  const stored = await repository.insert('srv-docs', { userId: USER, engine: ENGINE, config }, NOW);

  return { repository, tester, events, useCase, stored };
}

describe('TestMcpServerConnectionUseCase — plan 13, B-25', () => {
  it('tests the one saved server, with the configured timeout — S-111', async () => {
    const { useCase, tester, stored } = await harness();

    const outcome = await useCase.execute(USER, ENGINE, stored.id);

    expect(outcome).toEqual({ status: 'connected', tools: [], error: null });
    expect(tester.calls).toEqual([{ name: 'docs', timeoutMs: MCP_SERVER_TEST_TIMEOUT_MS }]);
  });

  it('records mcp.serverTested — testing executes the command — S-114', async () => {
    const { useCase, events, stored } = await harness();

    await useCase.execute(USER, ENGINE, stored.id);

    expect(events.kinds).toEqual(['mcp.serverTested']);
    expect(events.appended[0]).toMatchObject({
      subjectId: stored.id,
      subjectLabel: 'docs',
      details: { engine: ENGINE, status: 'connected' },
    });
  });

  it('two tests of the same server at once share the one in flight — S-113', async () => {
    const { useCase, tester, stored } = await harness();
    const deferred: { resolve: (outcome: McpServerTestOutcome) => void } = {
      resolve: () => undefined,
    };
    const held = new Promise<McpServerTestOutcome>((resolve) => {
      deferred.resolve = resolve;
    });
    tester.test = (() => held) as McpServerConnectionTester['test'];

    const first = useCase.execute(USER, ENGINE, stored.id);
    const second = useCase.execute(USER, ENGINE, stored.id);
    deferred.resolve({ status: 'failed', tools: [], error: 'boom' });

    expect(await first).toEqual(await second);
    expect(await first).toBe(await second);
  });

  it('a later test of the same server runs its own, once the first has settled', async () => {
    const { useCase, tester, stored } = await harness();

    await useCase.execute(USER, ENGINE, stored.id);
    await useCase.execute(USER, ENGINE, stored.id);

    expect(tester.calls).toHaveLength(2);
  });

  it('refuses a server of somebody else, before any test runs — S-76, S-77', async () => {
    const { useCase, tester, stored } = await harness();

    await expect(useCase.execute(OTHER_USER, ENGINE, stored.id)).rejects.toBeInstanceOf(
      McpServerForbiddenError,
    );
    expect(tester.calls).toEqual([]);
  });

  it('refuses an engine without the mcp capability, before any test runs', async () => {
    const { useCase, tester, stored } = await harness();

    await expect(useCase.execute(USER, 'codex', stored.id)).rejects.toBeInstanceOf(
      McpEngineNotSupportedError,
    );
    expect(tester.calls).toEqual([]);
  });

  it('lets whatever the tester throws propagate — no slot, a dead engine, a silent one', async () => {
    const { useCase, tester, stored } = await harness();
    tester.failWith = new Error('no slot');

    await expect(useCase.execute(USER, ENGINE, stored.id)).rejects.toThrow('no slot');
  });

  it('answers failed, never calling the tester, when the engine has no registered tester', async () => {
    const { repository, tester, events, stored } = await harness();
    const useCase = new TestMcpServerConnectionUseCase({
      servers: repository,
      capabilities: new McpEngineCapabilities([ENGINE]),
      testers: new McpServerConnectionTesters([]),
      trail: new RecordAuditEventUseCase(events, new SequentialIds()),
      clock: new FixedClock(NOW),
      timeoutMs: MCP_SERVER_TEST_TIMEOUT_MS,
    });

    const outcome = await useCase.execute(USER, ENGINE, stored.id);

    expect(outcome).toEqual({ status: 'failed', tools: [], error: null });
    expect(tester.calls).toEqual([]);
  });

  it('answers failed when the server is gone by the time its secret is revealed — a real race', async () => {
    const { repository, stored, events } = await harness();
    const tester = new RecordingTester();
    const useCase = new TestMcpServerConnectionUseCase({
      servers: new RevealRacingMcpServerRepository(repository, stored.id),
      capabilities: new McpEngineCapabilities([ENGINE]),
      testers: new McpServerConnectionTesters([{ engine: ENGINE, tester }]),
      trail: new RecordAuditEventUseCase(events, new SequentialIds()),
      clock: new FixedClock(NOW),
      timeoutMs: MCP_SERVER_TEST_TIMEOUT_MS,
    });

    const outcome = await useCase.execute(USER, ENGINE, stored.id);

    expect(outcome).toEqual({ status: 'failed', tools: [], error: null });
    expect(tester.calls).toEqual([]);
  });
});
