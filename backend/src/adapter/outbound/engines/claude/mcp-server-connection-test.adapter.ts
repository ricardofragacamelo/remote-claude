import { tmpdir } from 'node:os';

import { Inject, Injectable } from '@nestjs/common';

import type { McpServerConnectionTester } from '@application/mcp';
import { CLOCK, SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import type { McpServerConfig, McpServerTestOutcome, McpServerTool } from '@domain/mcp';
import type { Clock } from '@domain/shared';
import type { McpServerStatus, Query } from '@anthropic-ai/claude-agent-sdk';
import { hostEnvironment } from '@shared/process/host-environment';
import { redactMcpServerError } from './installation-mapping';
import { toSdkMcpServerConfig } from './mcp-config-mapping';
import { EphemeralClaude } from './ephemeral-claude';

/** How much longer the probe itself may run than the poll it wraps — CLI start-up overhead. */
const PROBE_OVERHEAD_MS = 10_000;

/** Between one read of `mcpServerStatus()` and the next, while the one server is still `pending`. */
const POLL_INTERVAL_MS = 250;

function toolOf(tool: NonNullable<McpServerStatus['tools']>[number]): McpServerTool {
  return {
    name: tool.name,
    description: tool.description ?? null,
    annotations: {
      ...(tool.annotations?.readOnly === undefined ? {} : { readOnly: tool.annotations.readOnly }),
      ...(tool.annotations?.destructive === undefined
        ? {}
        : { destructive: tool.annotations.destructive }),
      ...(tool.annotations?.openWorld === undefined
        ? {}
        : { openWorld: tool.annotations.openWorld }),
    },
  };
}

function outcomeOf(server: McpServerStatus): McpServerTestOutcome {
  if (server.status === 'connected') {
    return { status: 'connected', tools: (server.tools ?? []).map(toolOf), error: null };
  }
  if (server.status === 'needs-auth') {
    return { status: 'needs-auth', tools: [], error: null };
  }
  return {
    status: 'failed',
    tools: [],
    error: server.error === undefined ? null : redactMcpServerError(server.error),
  };
}

function sleep(scheduler: Scheduler, ms: number): Promise<void> {
  return new Promise((resolve) => {
    scheduler.after(ms, resolve);
  });
}

/**
 * Tests the connection of one saved server, for real (plan 13, B-25): a throwaway probe carries
 * only that one server, strict, the same way {@link EphemeralClaude} already opens one for the
 * installation's own probe and the test of the model's connection — reserving a slot of the
 * capacity before anything spawns, closed whatever happens.
 *
 * The server reaches the probe through `setMcpServers()`, after the query opens, never through its
 * options (D-02): a server under test can carry exactly the secret a saved one can, and the argv a
 * throwaway process is launched with is no safer a place for it than a real session's.
 */
@Injectable()
export class AgentSdkMcpServerConnectionTest implements McpServerConnectionTester {
  constructor(
    @Inject(EphemeralClaude) private readonly claude: EphemeralClaude,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async test(config: McpServerConfig, timeoutMs: number): Promise<McpServerTestOutcome> {
    return this.claude.ask(
      {
        cwd: tmpdir(),
        op: 'engine.mcp.test',
        subject: config.name,
        what: 'connect the MCP server',
        timeoutMs: timeoutMs + PROBE_OVERHEAD_MS,
      },
      (query) => this.probe(query, config, timeoutMs),
    );
  }

  private async probe(
    query: Query,
    config: McpServerConfig,
    timeoutMs: number,
  ): Promise<McpServerTestOutcome> {
    const env = hostEnvironment(process.env);
    await query.setMcpServers({ [config.name]: toSdkMcpServerConfig(config, env) });

    const deadline = this.clock.now().getTime() + timeoutMs;

    for (;;) {
      const servers = await query.mcpServerStatus();
      const found = servers.find((server) => server.name === config.name);

      if (found !== undefined && found.status !== 'pending') {
        return outcomeOf(found);
      }

      if (this.clock.now().getTime() >= deadline) {
        return { status: 'timeout', tools: [], error: null };
      }

      await sleep(this.scheduler, POLL_INTERVAL_MS);
    }
  }
}
