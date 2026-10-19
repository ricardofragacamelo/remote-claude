import type { McpEngineDialect } from '@domain/mcp';
import { CLAUDE_ENGINE } from './claude-engine';

/**
 * The variable the Claude CLI reads to find its own configuration directory — reserved from an MCP
 * server's own `env` (plan 13, B-18, S-66): a server that could set it would point the CLI's whole
 * session configuration, login included, somewhere the user never chose. Unrelated to
 * `shared/process/host-environment.ts`'s deny list, which filters the **backend's** variables out
 * of the subprocess the CLI itself runs in — this one is about what a configured server may ask
 * the CLI to hand to *it*.
 */
const CLAUDE_CONFIG_DIR_VAR = 'CLAUDE_CONFIG_DIR';

/** A server name with `__` is ambiguous for this engine's classifier (`mcp__<server>__<tool>`). */
const AMBIGUOUS_NAME = /__/;

/**
 * What only the Claude adapter knows about its own MCP surface (plan 13, B-18): the reason it
 * refuses a server name, and the env var it reserves for itself. Registered with
 * {@link import('@application/mcp').McpEngineDialects} by the composition, never imported by the
 * core directly.
 */
export const claudeMcpEngineDialect: McpEngineDialect = {
  engine: CLAUDE_ENGINE,
  rejectsServerName(name: string): string | null {
    return AMBIGUOUS_NAME.test(name) ? 'nameAmbiguousForEngine' : null;
  },
  reservedEnvNames: [CLAUDE_CONFIG_DIR_VAR],
};
