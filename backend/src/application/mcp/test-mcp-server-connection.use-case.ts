import type { RecordAuditEventUseCase } from '@application/audit';
import { SingleFlight } from '@application/shared';
import type { McpServerTestOutcome } from '@domain/mcp';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import { configFromRevealed } from './config-from-revealed';
import type { McpServerConnectionTesters } from './mcp-server-connection-testers';
import type { McpEngineCapabilities } from './mcp-engine-capabilities';
import { ownedServer } from './owned-server';
import type { McpServerRepository } from './ports/mcp-server-repository.port';

/** How long a test may take before it reports `timeout`, data rather than a thrown error. */
export const MCP_SERVER_TEST_TIMEOUT_MS = 15_000;

/** Where the deadline above is injected from — a test of this use case gives it a shorter one. */
export const MCP_SERVER_TEST_TIMEOUT = Symbol('McpServerTestTimeoutMs');

/**
 * What every test of a connection is built with — a plain value, not a constant read inside the
 * use case, so a test of this very use case can give it a deadline worth waiting out (plan 13,
 * B-25; the same reason `ModelCheckSettings` carries its own `timeoutMs`, plan 13, B-12).
 */
export interface TestMcpServerConnectionDependencies {
  readonly servers: McpServerRepository;
  readonly capabilities: McpEngineCapabilities;
  readonly testers: McpServerConnectionTesters;
  readonly trail: RecordAuditEventUseCase;
  readonly clock: Clock;
  readonly timeoutMs: number;
}

/**
 * `POST /engines/:engine/mcp-servers/:id/test` — testing an already-saved server, for real (plan
 * 13, B-25): a throwaway probe of the engine carries only this one server, strict, and the status
 * canonical connection status it reaches — `connected`, `failed`, `needs-auth`, or `timeout` when
 * none of those arrives in time — comes back with its tools and a redacted error. Testing
 * **executes** the server's own command, so it is audited (`mcp.serverTested`) the same as a change
 * to the store is, and it only exists for a server that already passed the second step B-18 built.
 *
 * One test in flight per server (S-113): a second request for the same one gets the first's answer
 * instead of a second subprocess. It takes a slot of the capacity the same way the probe of B-10
 * and the test of the model's connection (D-08) already do — refused outright, before anything
 * spawns, when the installation is already at its limit (S-115).
 */
export class TestMcpServerConnectionUseCase {
  private readonly inFlight = new SingleFlight<McpServerTestOutcome>();

  constructor(private readonly deps: TestMcpServerConnectionDependencies) {}

  /** @throws {import('@domain/mcp').McpEngineNotSupportedError} and ownership's (S-76, S-77) */
  async execute(userId: UserId, engine: string, serverId: string): Promise<McpServerTestOutcome> {
    this.deps.capabilities.assertSupports(engine);
    const owned = await ownedServer(this.deps.servers, userId, serverId);

    return this.inFlight.run(serverId, () => this.run(userId, engine, serverId, owned.name));
  }

  private async run(
    userId: UserId,
    engine: string,
    serverId: string,
    name: string,
  ): Promise<McpServerTestOutcome> {
    const tester = this.deps.testers.for(engine);
    const revealed = await this.deps.servers.reveal(serverId);

    const outcome: McpServerTestOutcome =
      tester === null || revealed === null
        ? { status: 'failed', tools: [], error: null }
        : await tester.test(configFromRevealed(revealed), this.deps.timeoutMs);

    const at = this.deps.clock.now();
    await this.deps.trail.execute({
      userId,
      kind: 'mcp.serverTested',
      subjectId: serverId,
      subjectLabel: name,
      details: { engine, status: outcome.status },
      at,
    });

    return outcome;
  }
}
