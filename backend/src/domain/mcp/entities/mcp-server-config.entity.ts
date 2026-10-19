import { McpServerConfigInvalidError } from '../errors/mcp-server-config-invalid.error';
import type { McpEngineDialect } from '../ports/mcp-engine-dialect.port';

/** Where a server applies: every session of the user, or only below one folder (plan 13, D-01). */
export const MCP_SCOPES = ['user', 'folder'] as const;
export type McpServerScope = (typeof MCP_SCOPES)[number];

/** The three transports the neutral protocol defines — never a field of one inside another. */
export const MCP_TRANSPORTS = ['stdio', 'http', 'sse'] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

/** One environment variable of a stdio server — the value is a secret (plan 13, D-02). */
export interface McpEnvVar {
  readonly name: string;
  readonly value: string;
}

/** One HTTP header of a remote server — the value is a secret (plan 13, D-02). */
export interface McpHeader {
  readonly name: string;
  readonly value: string;
}

/**
 * The name, scope and transport of a server — what every shape of it carries, validated or not,
 * stored or proposed. Shared so the identity of a server is declared once (plan 13, B-18, B-19).
 */
export interface McpServerIdentity {
  readonly name: string;
  readonly scope: McpServerScope;
  readonly folderPath: string | null;
  readonly transport: McpTransport;
}

/** The shape a caller proposes — not yet validated. */
export interface McpServerInput extends McpServerIdentity {
  readonly command?: string | null;
  readonly args?: readonly string[];
  readonly env?: readonly McpEnvVar[];
  readonly url?: string | null;
  readonly headers?: readonly McpHeader[];
}

/** A server configuration that passed every rule of {@link createMcpServerConfig} — every field set. */
export interface McpServerConfig extends McpServerIdentity {
  readonly command: string | null;
  readonly args: readonly string[];
  readonly env: readonly McpEnvVar[];
  readonly url: string | null;
  readonly headers: readonly McpHeader[];
}

/** `^[A-Za-z0-9_-]{1,64}$` — the universal name rule; the engine may still refuse more (B-18). */
export const MCP_SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
// RFC 7230 `token` — what an HTTP header name may be made of.
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Env vars that change how *any* process loads, or that are ours — no server may set these. */
const UNIVERSAL_RESERVED_ENV_EXACT = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'NODE_OPTIONS'] as const;
const UNIVERSAL_RESERVED_ENV_PREFIXES = ['DYLD_', 'REMOTE_CLAUDE_'] as const;

/** Counts and sizes a server configuration may not exceed (plan 13, B-18). */
export const MCP_LIMITS = {
  maxArgs: 32,
  maxArgLength: 1024,
  maxEnvVars: 32,
  maxEnvValueLength: 4096,
  maxHeaders: 32,
  maxHeaderValueLength: 4096,
  maxCommandLength: 1024,
  maxUrlLength: 2048,
} as const;

function isUniversallyReservedEnvName(name: string): boolean {
  return (
    (UNIVERSAL_RESERVED_ENV_EXACT as readonly string[]).includes(name) ||
    UNIVERSAL_RESERVED_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

function invalid(rule: string, field: string): never {
  throw new McpServerConfigInvalidError(rule, field);
}

function validateName(name: string, dialect: McpEngineDialect): string {
  if (!MCP_SERVER_NAME_PATTERN.test(name)) {
    invalid('nameFormat', 'name');
  }
  const rejection = dialect.rejectsServerName(name);
  if (rejection !== null) {
    invalid(rejection, 'name');
  }
  return name;
}

function validateScope(scope: McpServerScope, folderPath: string | null): void {
  if (!(MCP_SCOPES as readonly string[]).includes(scope)) {
    invalid('scopeUnknown', 'scope');
  }
  if (scope === 'folder' && (folderPath === null || folderPath.trim() === '')) {
    invalid('folderRequired', 'folderPath');
  }
  if (scope === 'user' && folderPath !== null) {
    invalid('folderNotAllowed', 'folderPath');
  }
}

function validateArgs(args: readonly string[]): readonly string[] {
  if (args.length > MCP_LIMITS.maxArgs) {
    invalid('tooManyArgs', 'args');
  }
  for (const arg of args) {
    if (arg.length > MCP_LIMITS.maxArgLength) {
      invalid('argTooLong', 'args');
    }
  }
  return args;
}

function validateEnv(env: readonly McpEnvVar[], dialect: McpEngineDialect): readonly McpEnvVar[] {
  if (env.length > MCP_LIMITS.maxEnvVars) {
    invalid('tooManyEnvVars', 'env');
  }
  const seen = new Set<string>();
  for (const entry of env) {
    if (!ENV_NAME_PATTERN.test(entry.name)) {
      invalid('envNameFormat', 'env');
    }
    if (seen.has(entry.name)) {
      invalid('envNameDuplicate', 'env');
    }
    seen.add(entry.name);
    if (entry.value.length > MCP_LIMITS.maxEnvValueLength) {
      invalid('envValueTooLong', 'env');
    }
    if (isUniversallyReservedEnvName(entry.name) || dialect.reservedEnvNames.includes(entry.name)) {
      invalid('envReserved', 'env');
    }
  }
  return env;
}

function validateHeaders(headers: readonly McpHeader[]): readonly McpHeader[] {
  if (headers.length > MCP_LIMITS.maxHeaders) {
    invalid('tooManyHeaders', 'headers');
  }
  const seen = new Set<string>();
  for (const header of headers) {
    if (!HEADER_NAME_PATTERN.test(header.name)) {
      invalid('headerNameFormat', 'headers');
    }
    const key = header.name.toLowerCase();
    if (seen.has(key)) {
      invalid('headerNameDuplicate', 'headers');
    }
    seen.add(key);
    if (header.value.length > MCP_LIMITS.maxHeaderValueLength) {
      invalid('headerValueTooLong', 'headers');
    }
  }
  return headers;
}

function validateUrl(url: string): string {
  if (url.length > MCP_LIMITS.maxUrlLength) {
    invalid('urlTooLong', 'url');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return invalid('urlInvalid', 'url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    invalid('urlScheme', 'url');
  }
  return url;
}

function validateStdioFields(input: McpServerInput): {
  command: string;
  args: readonly string[];
  env: readonly McpEnvVar[];
} {
  const command = (input.command ?? '').trim();
  if (command === '') {
    invalid('commandRequired', 'command');
  }
  if (command.length > MCP_LIMITS.maxCommandLength) {
    invalid('commandTooLong', 'command');
  }
  if (input.url !== undefined && input.url !== null) {
    invalid('urlNotAllowed', 'url');
  }
  if (input.headers !== undefined && input.headers.length > 0) {
    invalid('headersNotAllowed', 'headers');
  }
  return { command, args: validateArgs(input.args ?? []), env: input.env ?? [] };
}

function validateRemoteFields(input: McpServerInput): {
  url: string;
  headers: readonly McpHeader[];
} {
  if (input.command !== undefined && input.command !== null) {
    invalid('commandNotAllowed', 'command');
  }
  if (input.args !== undefined && input.args.length > 0) {
    invalid('argsNotAllowed', 'args');
  }
  if (input.env !== undefined && input.env.length > 0) {
    invalid('envNotAllowed', 'env');
  }
  return { url: validateUrl(input.url ?? ''), headers: input.headers ?? [] };
}

/**
 * The one way an {@link McpServerConfig} comes to exist (plan 13, B-18). Pure: no I/O, no clock, no
 * engine name baked in — the engine's own refusal reaches this through [dialect], the port the
 * adapter of the engine implements.
 *
 * @throws {McpServerConfigInvalidError} a rule the config breaks, with the field it broke at
 */
export function createMcpServerConfig(
  input: McpServerInput,
  dialect: McpEngineDialect,
): McpServerConfig {
  const name = validateName(input.name, dialect);
  validateScope(input.scope, input.folderPath);

  if (!(MCP_TRANSPORTS as readonly string[]).includes(input.transport)) {
    invalid('transportUnknown', 'transport');
  }

  if (input.transport === 'stdio') {
    const { command, args, env } = validateStdioFields(input);
    return {
      name,
      scope: input.scope,
      folderPath: input.folderPath,
      transport: 'stdio',
      command,
      args,
      env: validateEnv(env, dialect),
      url: null,
      headers: [],
    };
  }

  const { url, headers } = validateRemoteFields(input);
  return {
    name,
    scope: input.scope,
    folderPath: input.folderPath,
    transport: input.transport,
    command: null,
    args: [],
    env: [],
    url,
    headers: validateHeaders(headers),
  };
}
