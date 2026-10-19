import type { ContextUsePayload, ContextUsePayloadCategoriesItem } from '@remote-claude/contracts';

/** A model the installation offers — its data, shown as it is (plan 08, B-36). */
export interface InstallationModel {
  readonly value: string;
  readonly resolvedModel: string | null;
  readonly displayName: string;
  readonly description: string;
  readonly supportsEffort: boolean;

  /** The levels the model takes, as it names them — offered only where its engine announces them. */
  readonly supportedEffortLevels: readonly string[];
}

/** The models of a session's installation, and the one it runs. */
export interface SessionModels {
  readonly current: string | null;
  readonly models: readonly InstallationModel[];
}

/**
 * One category of the context window (plan 28, B-24): a canonical one names itself by `messageKey`,
 * any other by the engine's own `text`. `name` is the previous protocol's, and nothing here reads it.
 */
export type ContextCategory = ContextUsePayloadCategoriesItem;

/** The use of a session's context window (B-37), in the order the meter reads it. */
export type ContextUse = ContextUsePayload;

/**
 * Where an MCP server's definition came from (plan 13, B-22): `ours` is one of the store, `project`
 * an approved entry of the engine's own project file, `plugin` one a plugin brought, `other`
 * anything else — never trusted as ours, whatever it is named.
 */
export type McpSource = 'ours' | 'project' | 'plugin' | 'other';

/** An MCP server of the session (B-38; plan 13, B-22). */
export interface McpServer {
  readonly name: string;
  readonly status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
  readonly source: McpSource;
  readonly toolCount: number;

  /** Why it failed, redacted — absent unless `status` is `failed`. */
  readonly error?: string;
}
