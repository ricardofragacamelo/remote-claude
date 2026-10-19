import type {
  McpServerStatus,
  ModelInfo,
  SDKControlGetContextUsageResponse,
} from '@anthropic-ai/claude-agent-sdk';

import { SESSION_MCP_STATUS_CHANGED_PAYLOAD_SERVERS_ITEM_LIMITS as MCP_ERROR_LIMITS } from '@remote-claude/contracts';

import { categoryIdOf, contextCategory, EFFORT_LEVELS } from '@domain/session';
import type {
  CanonicalContextCategory,
  ContextKind,
  ContextUse,
  EffortLevel,
  InstallationModel,
  McpServer,
  McpSource,
  McpStatus,
} from '@domain/session';

const KINDS: readonly string[] = ['used', 'free', 'buffer', 'deferred'];

/**
 * The categories of Claude Code's context window that are canonical, by the id of the name it gives
 * them (plan 28, B-24). The rest — skills, MCP tools, deferred tools — go with Claude Code's words.
 */
const CANONICAL_CATEGORIES: Readonly<Record<string, CanonicalContextCategory>> = {
  systemPrompt: 'system',
  systemTools: 'tools',
  messages: 'messages',
  memoryFiles: 'memory',
  freeSpace: 'free',
  autocompactBuffer: 'reserved',
};
const STATUSES: readonly string[] = ['connected', 'failed', 'needs-auth', 'pending', 'disabled'];

/**
 * `source` → ours, by the engine's own word for it (plan 13, B-22, S-93; D-02, D-25): a server we
 * compose and hand over with `setMcpServers()` reaches the engine as `dynamic` — the scope its own
 * `--mcp-config` / `mcp_set_servers` path reports, never `sdk` (reserved for a server the engine's own
 * host registers in-process, which this product never does) and never a name. Anything the engine
 * calls `plugin` is a plugin's; everything else — `sdk`, `user`, `project`, `local`, `managed`,
 * `enterprise`, `claudeai`, `agent`, absent, or a word a future engine version invents — is `other`,
 * on purpose: an unrecognised source is never promoted to `ours`, because that is exactly the
 * confusion a same-named impostor would be counting on.
 */
const OURS_SOURCE = 'dynamic';
const PLUGIN_SOURCE = 'plugin';

function mcpSourceOf(raw: string | undefined): McpSource {
  if (raw === OURS_SOURCE) {
    return 'ours';
  }
  if (raw === PLUGIN_SOURCE) {
    return 'plugin';
  }
  return 'other';
}

/** `${URL}?query#fragment` → `${URL}`, so a token passed as a query string never reaches a client. */
const URL_WITH_TAIL = /(https?:\/\/[^\s?#]+)([?#]\S*)/gi;
/** `Bearer <token>`, `Authorization: <token>` → the scheme kept, the token gone. */
const BEARER_OR_AUTH = /\b((?:bearer|authorization:?)\s+)(\S+)/gi;

/**
 * [raw], with what a URL or a header would carry replaced — an MCP server's own error text is its
 * author's, not ours, and the one thing every engine passes through verbatim (plan 13, B-22, S-96).
 * Truncated to what the event's own schema allows, after redaction, so a long message is shortened
 * rather than silently dropped.
 */
export function redactMcpServerError(raw: string): string {
  const scrubbed = raw
    .replace(URL_WITH_TAIL, (_match, base: string) => base)
    .replace(BEARER_OR_AUTH, (_match, prefix: string) => `${prefix}[REDACTED]`);

  return scrubbed.length > MCP_ERROR_LIMITS.error.maxLength
    ? `${scrubbed.slice(0, MCP_ERROR_LIMITS.error.maxLength - 1)}…`
    : scrubbed;
}

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
    categories: usage.categories.map((category) => {
      const id = categoryIdOf(category.name);
      return contextCategory(
        id,
        category.name,
        category.tokens,
        (KINDS.includes(category.kind) ? category.kind : 'used') as ContextKind,
        CANONICAL_CATEGORIES[id] ?? null,
      );
    }),
  };
}

/**
 * An MCP server as the SDK reports it → ours: its name, how it stands, where it came from and how
 * many tools — never its configuration (a URL can carry a token), and its error only redacted
 * (B-22, S-96).
 */
export function toMcpServer(server: McpServerStatus): McpServer {
  const status = (STATUSES.includes(server.status) ? server.status : 'failed') as McpStatus;

  return {
    name: server.name,
    status,
    source: mcpSourceOf(server.source),
    toolCount: server.tools?.length ?? 0,
    ...(status === 'failed' && server.error !== undefined
      ? { error: redactMcpServerError(server.error) }
      : {}),
  };
}
