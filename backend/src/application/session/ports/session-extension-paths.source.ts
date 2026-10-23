import type { UserId } from '@domain/auth';

/** What a session asks before it opens: whose, and which engine. */
export interface SessionExtensionPathsRequest {
  readonly userId: UserId;
  readonly engine: string;
}

/**
 * How a session asks which extension directories it opens with (plan 13, B-27) — a port the session
 * declares, so the session never imports the module that answers it, the same shape
 * {@link import('./session-mcp-servers.source').SessionMcpServersSource} already has. Unlike that
 * one, what this composes is opaque to the core (see `AgentSessionStart.extensionPaths`): the core
 * only ever carries a list of directories from here to the engine's own adapter, never opens one.
 */
export interface SessionExtensionPathsSource {
  pathsFor(request: SessionExtensionPathsRequest): Promise<readonly string[]>;
}

export const SESSION_EXTENSION_PATHS_SOURCE = Symbol('SessionExtensionPathsSource');
