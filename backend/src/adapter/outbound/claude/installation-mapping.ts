import type {
  McpServerStatus,
  ModelInfo,
  SDKControlGetContextUsageResponse,
} from '@anthropic-ai/claude-agent-sdk';

import { categoryIdOf, EFFORT_LEVELS } from '@domain/session';
import type {
  ContextKind,
  ContextUse,
  EffortLevel,
  InstallationModel,
  McpServer,
  McpStatus,
} from '@domain/session';

const KINDS: readonly string[] = ['used', 'free', 'buffer', 'deferred'];
const STATUSES: readonly string[] = ['connected', 'failed', 'needs-auth', 'pending', 'disabled'];

/** A model as the SDK describes it → ours: what the selector shows, nothing it does not. */
export function toInstallationModel(model: ModelInfo): InstallationModel {
  const levels = (model.supportedEffortLevels ?? []).filter((level): level is EffortLevel =>
    (EFFORT_LEVELS as readonly string[]).includes(level),
  );

  return {
    value: model.value,
    resolvedModel: model.resolvedModel ?? null,
    displayName: model.displayName,
    description: model.description,
    supportsEffort: model.supportsEffort === true && levels.length > 0,
    supportedEffortLevels: model.supportsEffort === true ? levels : [],
  };
}

/** The use of the context window → ours: the categories and the totals, no grid, no file paths. */
export function toContextUse(usage: SDKControlGetContextUsageResponse): ContextUse {
  return {
    model: usage.model,
    totalTokens: usage.totalTokens,
    maxTokens: usage.maxTokens,
    percentage: usage.percentage,
    categories: usage.categories.map((category) => ({
      id: categoryIdOf(category.name),
      name: category.name,
      tokens: category.tokens,
      kind: (KINDS.includes(category.kind) ? category.kind : 'used') as ContextKind,
    })),
  };
}

/**
 * An MCP server as the SDK reports it → ours: its name, how it stands and how many tools — **never**
 * its configuration (a URL can carry a token) nor its raw error (it can carry a path).
 */
export function toMcpServer(server: McpServerStatus): McpServer {
  return {
    name: server.name,
    status: (STATUSES.includes(server.status) ? server.status : 'failed') as McpStatus,
    toolCount: server.tools?.length ?? 0,
  };
}
