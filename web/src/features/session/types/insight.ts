import type { EffortLevel } from '../store/claude-panel.store';

/** A model the installation offers — its data, shown as it is (plan 08, B-36). */
export interface InstallationModel {
  readonly value: string;
  readonly resolvedModel: string | null;
  readonly displayName: string;
  readonly description: string;
  readonly supportsEffort: boolean;
  readonly supportedEffortLevels: readonly EffortLevel[];
}

/** The models of a session's installation, and the one it runs. */
export interface SessionModels {
  readonly current: string | null;
  readonly models: readonly InstallationModel[];
}

/** One category of the context window. */
export interface ContextCategory {
  readonly id: string;
  readonly name: string;
  readonly tokens: number;
  readonly kind: 'used' | 'free' | 'buffer' | 'deferred';
}

/** The use of a session's context window (B-37), in the order the meter reads it. */
export interface ContextUse {
  /** How full the window is, from 0 to 100 — what the bar shows. */
  readonly percentage: number;
  readonly totalTokens: number;
  readonly maxTokens: number;

  /** What fills it, category by category — what a click on the meter shows. */
  readonly categories: readonly ContextCategory[];

  /** The model whose window it is. */
  readonly model: string;
}

/** An MCP server of the session (B-38). */
export interface McpServer {
  readonly name: string;
  readonly status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
  readonly toolCount: number;
}
