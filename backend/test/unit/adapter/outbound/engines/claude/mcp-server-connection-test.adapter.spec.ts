import { AgentTimeoutError } from '@domain/engine';
import { describe, expect, it } from 'vitest';
import type { McpServerStatus, McpSetServersResult, Query } from '@anthropic-ai/claude-agent-sdk';

import { AgentSdkMcpServerConnectionTest } from '@adapter/outbound/engines/claude/mcp-server-connection-test.adapter';
import { EphemeralClaude } from '@adapter/outbound/engines/claude/ephemeral-claude';
import type { QueryFactory } from '@adapter/outbound/engines/claude/query.factory';
import { SessionRegistry } from '@application/session';
import type { McpServerConfig } from '@domain/mcp';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../../../support/fakes/manual-scheduler';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const STDIO_CONFIG: McpServerConfig = {
  name: 'docs',
  scope: 'user',
  folderPath: null,
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server'],
  env: [{ name: 'TOKEN', value: 'secret' }],
  url: null,
  headers: [],
};

/** What one fake query was asked, and what it answers each time `mcpServerStatus()` is called. */
interface Fake {
  readonly setCalls: Record<string, unknown>[];
  statusReplies: McpServerStatus[][];
  closed: number;
}

function factoryOf(): { createQuery: QueryFactory; fake: Fake } {
  const fake: Fake = {
    setCalls: [],
    statusReplies: [[{ name: 'docs', status: 'pending' }]],
    closed: 0,
  };

  const createQuery: QueryFactory = () => {
    const query = {
      setMcpServers: (servers: Record<string, unknown>): Promise<McpSetServersResult> => {
        fake.setCalls.push(servers);
        return Promise.resolve({ added: Object.keys(servers), removed: [], errors: {} });
      },
      mcpServerStatus: (): Promise<McpServerStatus[]> =>
        Promise.resolve(
          fake.statusReplies.length > 1 ? fake.statusReplies.shift()! : fake.statusReplies[0]!,
        ),
      close: () => {
        fake.closed += 1;
      },
    };
    return query as unknown as Query;
  };

  return { createQuery, fake };
}

/**
 * [outerScheduler] stands for the one outer deadline `EphemeralClaude.ask` itself races — kept
 * separate from the poll's own scheduler so a test can fire one without the other, the same way
 * two *different* `setTimeout`s in the real scheduler never fire together just because a test
 * fired one of them.
 */
function harness(outerScheduler = new ManualScheduler(), pollScheduler = new ManualScheduler()) {
  const { createQuery, fake } = factoryOf();
  const registry = new SessionRegistry(4, new FixedClock(new Date()));
  const clock = new FixedClock(new Date('2026-10-19T00:00:00Z'));
  const tester = new AgentSdkMcpServerConnectionTest(
    new EphemeralClaude(createQuery, registry, outerScheduler, new RecordingLogger().logger),
    pollScheduler,
    clock,
  );
  return { tester, fake, registry, clock, outerScheduler, pollScheduler };
}

describe('testing an MCP server’s connection — plan 13, B-25', () => {
  it('sets only the one server under test, and reads its status back — S-111', async () => {
    const { tester, fake } = harness();
    fake.statusReplies = [[{ name: 'docs', status: 'connected', tools: [{ name: 'search' }] }]];

    const outcome = await tester.test(STDIO_CONFIG, 5_000);

    expect(fake.setCalls).toEqual([
      { docs: { type: 'stdio', command: 'npx', args: ['-y', 'server'], env: { TOKEN: 'secret' } } },
    ]);
    expect(outcome).toEqual({
      status: 'connected',
      tools: [{ name: 'search', description: null, annotations: {} }],
      error: null,
    });
  });

  it('carries a tool’s annotations through, only the ones the server actually said', async () => {
    const { tester, fake } = harness();
    fake.statusReplies = [
      [
        {
          name: 'docs',
          status: 'connected',
          tools: [
            {
              name: 'delete_repo',
              description: 'Deletes a repository',
              annotations: { destructive: true },
            },
          ],
        },
      ],
    ];

    const outcome = await tester.test(STDIO_CONFIG, 5_000);

    expect(outcome.tools).toEqual([
      {
        name: 'delete_repo',
        description: 'Deletes a repository',
        annotations: { destructive: true },
      },
    ]);
  });

  it('carries readOnly and openWorld through too, each independent of the others', async () => {
    const { tester, fake } = harness();
    fake.statusReplies = [
      [
        {
          name: 'docs',
          status: 'connected',
          tools: [{ name: 'search', annotations: { readOnly: true, openWorld: true } }],
        },
      ],
    ];

    const outcome = await tester.test(STDIO_CONFIG, 5_000);

    expect(outcome.tools).toEqual([
      { name: 'search', description: null, annotations: { readOnly: true, openWorld: true } },
    ]);
  });

  it('answers needs-auth with no tools and no error', async () => {
    const { tester, fake } = harness();
    fake.statusReplies = [[{ name: 'docs', status: 'needs-auth' }]];

    expect(await tester.test(STDIO_CONFIG, 5_000)).toEqual({
      status: 'needs-auth',
      tools: [],
      error: null,
    });
  });

  it('answers failed with the server’s own error, redacted — S-96’s redaction, reused', async () => {
    const { tester, fake } = harness();
    fake.statusReplies = [
      [{ name: 'docs', status: 'failed', error: 'auth failed: Bearer sk-live-abc123' }],
    ];

    const outcome = await tester.test(STDIO_CONFIG, 5_000);

    expect(outcome.status).toBe('failed');
    expect(outcome.error).not.toContain('sk-live-abc123');
    expect(outcome.error).toContain('[REDACTED]');
  });

  it('answers failed with no error at all when the engine named none', async () => {
    const { tester, fake } = harness();
    fake.statusReplies = [[{ name: 'docs', status: 'failed' }]];

    expect(await tester.test(STDIO_CONFIG, 5_000)).toEqual({
      status: 'failed',
      tools: [],
      error: null,
    });
  });

  it('polls again while the server is still pending, waiting between reads — S-111', async () => {
    const { tester, fake, pollScheduler } = harness();
    fake.statusReplies = [
      [{ name: 'docs', status: 'pending' }],
      [{ name: 'docs', status: 'connected', tools: [] }],
    ];

    const running = tester.test(STDIO_CONFIG, 5_000);
    // Lets the first poll happen, schedule its wait, then releases that wait.
    await Promise.resolve();
    await Promise.resolve();
    pollScheduler.fire();

    expect(await running).toMatchObject({ status: 'connected' });
  });

  it('answers timeout, data rather than an error, once its own deadline passes — S-112', async () => {
    const { tester, fake, clock, pollScheduler } = harness();
    fake.statusReplies = [[{ name: 'docs', status: 'pending' }]];

    const running = tester.test(STDIO_CONFIG, 1_000);
    await Promise.resolve();
    await Promise.resolve();
    clock.advance(2_000);
    pollScheduler.fire();

    expect(await running).toEqual({ status: 'timeout', tools: [], error: null });
  });

  it('still closes the probe and gives the capacity slot back, even on a timeout', async () => {
    const { tester, fake, clock, registry, pollScheduler } = harness();
    fake.statusReplies = [[{ name: 'docs', status: 'pending' }]];

    const running = tester.test(STDIO_CONFIG, 1_000);
    await Promise.resolve();
    await Promise.resolve();
    clock.advance(2_000);
    pollScheduler.fire();
    await running;

    expect(registry.size).toBe(0);
  });

  it('lets a silent engine fail as an outer timeout, never as the data outcome — S-32’s shape', async () => {
    const scheduler = new ManualScheduler();
    const silentQuery: QueryFactory = () =>
      ({
        setMcpServers: () => new Promise(() => undefined),
        mcpServerStatus: () => new Promise(() => undefined),
        close: () => undefined,
      }) as unknown as ReturnType<QueryFactory>;
    const registry = new SessionRegistry(4, new FixedClock(new Date()));
    const tester = new AgentSdkMcpServerConnectionTest(
      new EphemeralClaude(silentQuery, registry, scheduler, new RecordingLogger().logger),
      scheduler,
      new FixedClock(new Date()),
    );

    const running = tester.test(STDIO_CONFIG, 1_000);
    scheduler.fire();

    await expect(running).rejects.toThrow(AgentTimeoutError);
  });
});
