/**
 * What a running Claude Code session puts in the environment of what it spawns.
 *
 * Run from inside one — a terminal of the editor, an agent of Claude Code itself — the CLI the SDK
 * spawns reads these and behaves as that session's child: another entrypoint, its tools and MCP
 * servers, its own task tools, its Bash guards. A recording or a measurement would then be of that
 * host, not of the CLI the product runs — measured in plan 08, where every turn of the first
 * recording carried `entrypoint: claude-vscode`
 * (docs/discovery/01-descoberta-claude-agent-sdk.md, §10.0).
 */
export const PARENT_SESSION_VARIABLES = Object.freeze([
  'CLAUDECODE',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_AGENT_SDK_VERSION',
  'MCP_CONNECTION_NONBLOCKING',
]);

export const PARENT_SESSION_PREFIX = 'CLAUDE_CODE_';

/**
 * The environment without what a parent Claude Code session put in it.
 *
 * @param {Readonly<Record<string, string | undefined>>} environment
 * @returns {Record<string, string | undefined>}
 */
export function withoutParentSession(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) =>
        !name.startsWith(PARENT_SESSION_PREFIX) && !PARENT_SESSION_VARIABLES.includes(name),
    ),
  );
}
