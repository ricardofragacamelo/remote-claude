import type { McpServerConfig as SdkMcpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { McpServerConfig } from '@domain/mcp';

/** `${VAR}` inside a string, our own expansion against the host environment (plan 13, D-25). */
const VAR_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * [value] with every `${VAR}` replaced from [env] — a name [env] does not have expands to empty, as
 * D-25 decided: `setMcpServers()` delivers the literal, so the CLI never expands it on our behalf,
 * and the environment it expands against is the host's, already without the backend's own
 * configuration ({@link import('@shared/process/host-environment').hostEnvironment}).
 */
function expand(value: string, env: Readonly<Record<string, string | undefined>>): string {
  return value.replace(VAR_REFERENCE, (_match, name: string) => env[name] ?? '');
}

/**
 * [server] as `Query.setMcpServers()` takes it — our validated config, translated once, here, and
 * nowhere else in the core (D-02; plan 13, B-21). Every env and header value is expanded against
 * [env] before it is handed over; the SDK's own `${VAR}` expansion only exists for the argv path,
 * which this one is built to avoid entirely.
 *
 * @throws {Error} `server` carries a `stdio` transport with no `command`, or a remote transport with
 *   no `url` — {@link createMcpServerConfig} never builds one of those; a caller that gets here with
 *   one is this module's own bug, not a configuration problem, and the field being typed nullable
 *   (shared by every transport) is the only reason this is reachable at all.
 */
export function toSdkMcpServerConfig(
  server: McpServerConfig,
  env: Readonly<Record<string, string | undefined>>,
): SdkMcpServerConfig {
  if (server.transport === 'stdio') {
    if (server.command === null) {
      throw new Error('a stdio MCP server reached toSdkMcpServerConfig with no command');
    }
    return {
      type: 'stdio',
      command: server.command,
      args: [...server.args],
      env: Object.fromEntries(server.env.map((entry) => [entry.name, expand(entry.value, env)])),
    };
  }

  if (server.url === null) {
    throw new Error('a remote MCP server reached toSdkMcpServerConfig with no url');
  }
  return {
    type: server.transport,
    url: server.url,
    headers: Object.fromEntries(
      server.headers.map((entry) => [entry.name, expand(entry.value, env)]),
    ),
  };
}
