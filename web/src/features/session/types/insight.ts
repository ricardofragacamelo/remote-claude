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

/** An MCP server of the session (B-38). */
export interface McpServer {
  readonly name: string;
  readonly status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
  readonly toolCount: number;
}
