import type { McpServerConfig } from '../entities/mcp-server-config.entity';

/**
 * A description in the same shape the screen's i18n layer reads elsewhere in the product
 * (`messageKey` + `params`, never a literal string — AGENTS.md rule 2): the client translates it, en
 * and pt-BR, and never sees the raw command or URL as a sentence we composed.
 */
export interface McpServerDescription {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * The "por extenso" of a server (plan 13, B-18, S-68): what it runs, with which args, where it
 * applies, and which variable *names* reach it — never a value. Pure and total: the same
 * {@link McpServerConfig} always yields the same description, so the second-step preview and the
 * row the store ends up writing never diverge (the one risk this function exists to remove).
 */
export function describeMcpServer(config: McpServerConfig): McpServerDescription {
  const inFolder = config.folderPath !== null;

  if (config.transport === 'stdio') {
    return {
      messageKey: inFolder ? 'mcp.description.stdioFolder' : 'mcp.description.stdioAnyFolder',
      params: {
        command: config.command ?? '',
        args: config.args.join(' '),
        folder: config.folderPath ?? '',
        envCount: config.env.length,
        envNames: config.env.map((entry) => entry.name).join(', '),
      },
    };
  }

  return {
    messageKey: inFolder ? 'mcp.description.remoteFolder' : 'mcp.description.remoteAnyFolder',
    params: {
      transport: config.transport,
      url: config.url ?? '',
      folder: config.folderPath ?? '',
      headerCount: config.headers.length,
      headerNames: config.headers.map((header) => header.name).join(', '),
    },
  };
}
