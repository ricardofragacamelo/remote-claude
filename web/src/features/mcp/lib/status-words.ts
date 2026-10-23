import type { McpScope, McpStatus, McpTransport } from '../types/mcp';

/** The chip of each status — named in full so the i18n check sees every key (S-131). */
export const STATUS_KEYS: Readonly<Record<McpStatus, string>> = {
  connected: 'agentSettings.mcp.statusConnected',
  failed: 'agentSettings.mcp.statusFailed',
  'needs-auth': 'agentSettings.mcp.statusNeedsAuth',
  pending: 'agentSettings.mcp.statusPending',
  disabled: 'agentSettings.mcp.statusDisabled',
};

/** Every server of the store is `ours` — the column still names it, for the day another origin
 * joins it in this same table (a plugin's own, say — B-29). */
export const ORIGIN_KEYS = {
  ours: 'agentSettings.mcp.originOurs',
} as const;

export const SCOPE_KEYS: Readonly<Record<McpScope, string>> = {
  user: 'agentSettings.mcp.scopeUser',
  folder: 'agentSettings.mcp.scopeFolder',
};

/** The longer sentence the wizard's preview step shows — `folder` only matters for `'folder'`. */
export const WIZARD_SCOPE_KEYS: Readonly<Record<McpScope, string>> = {
  user: 'agentSettings.mcp.wizardScopeUser',
  folder: 'agentSettings.mcp.wizardScopeFolder',
};

export const TRANSPORT_KEYS: Readonly<Record<McpTransport, string>> = {
  stdio: 'agentSettings.mcp.transportStdio',
  http: 'agentSettings.mcp.transportHttp',
  sse: 'agentSettings.mcp.transportSse',
};
