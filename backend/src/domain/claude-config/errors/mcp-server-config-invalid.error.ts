import { DomainError } from '@domain/shared';

/**
 * A server configuration that is understood and impossible: a name with `__`, a `file:` URL, a
 * variable that changes how a process loads. `422`, with the rule, so the screen can say which — a
 * body of the wrong type is `400` before it gets here.
 */
export class McpServerConfigInvalidError extends DomainError {
  readonly code = 'MCP_SERVER_CONFIG_INVALID';
  readonly messageKey = 'claudeConfig.error.mcpServerConfigInvalid';

  constructor(rule: string, field: string) {
    super(`the server configuration breaks ${rule} at ${field}`, { rule, field });
  }
}
