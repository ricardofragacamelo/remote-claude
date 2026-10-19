import { Inject, Injectable } from '@nestjs/common';

import { ComposeSessionMcpServersUseCase } from '@application/mcp';
import type { SessionMcpServersRequest, SessionMcpServersSource } from '@application/session';
import type { McpServerConfig } from '@domain/mcp';

/**
 * `session` asking `mcp` which servers a new session opens with — the whole of the coupling
 * between the two (plan 13, B-21, D-03), the same shape
 * {@link import('./agent-settings-module.configuration').AgentSettingsModuleConfiguration} already
 * has for the defaults.
 */
@Injectable()
export class McpModuleSessionMcpServers implements SessionMcpServersSource {
  constructor(
    @Inject(ComposeSessionMcpServersUseCase)
    private readonly compose: ComposeSessionMcpServersUseCase,
  ) {}

  composeFor(request: SessionMcpServersRequest): Promise<readonly McpServerConfig[]> {
    return this.compose.execute(request);
  }
}
