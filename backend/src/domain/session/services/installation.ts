import { EffortUnsupportedError } from '../errors/effort-unsupported.error';
import { ForkPointUnknownError } from '../errors/fork-point-unknown.error';
import type { SlashCommand } from './slash-commands';

/** The levels of effort the SDK knows. */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/** A model the installation offers, as the session's selector shows it (plan 08, B-36). */
export interface InstallationModel {
  /** What `setModel` and `session.start.model` take. */
  readonly value: string;

  /** The id it resolves to (`sonnet` → `claude-sonnet-5`), when the installation says. */
  readonly resolvedModel: string | null;

  /** Data of the installation, shown as it is — like the description of a slash command. */
  readonly displayName: string;
  readonly description: string;
  readonly supportsEffort: boolean;
  readonly supportedEffortLevels: readonly EffortLevel[];
}

/** The account the CLI is signed in to — never a token, never the path of a credential (plan 13, D-07). */
export interface InstallationAccount {
  readonly email: string | null;
  readonly organization: string | null;
  readonly plan: string | null;
  readonly provider: string | null;

  /** The **name** of where the credential comes from, never the credential. */
  readonly tokenSource: string | null;
  readonly apiKeySource: string | null;
}

/** A subagent the installation offers. */
export interface InstallationAgent {
  readonly name: string;
  readonly description: string;
  readonly model: string | null;
}

/**
 * What the installation says about itself in one question — `initializationResult()` (plan 13,
 * D-05): commands, agents, models, output styles and the account.
 */
export interface SessionInitialization {
  readonly commands: readonly SlashCommand[];
  readonly agents: readonly InstallationAgent[];
  readonly models: readonly InstallationModel[];
  readonly outputStyle: string;
  readonly outputStyles: readonly string[];
  readonly account: InstallationAccount;
}

/**
 * Refuses an effort the model does not take — none at all, or not that level (D-16, S-171).
 *
 * A model the list does not name is not refused: the list is discovery, and a model set by its full
 * id (`claude-sonnet-5`) is matched by what the aliases resolve to, or not at all.
 *
 * @throws {EffortUnsupportedError} the model is known and does not take `level`
 */
export function refuseUnsupportedEffort(
  models: readonly InstallationModel[],
  model: string,
  level: EffortLevel,
): void {
  const known = models.find(
    (candidate) => candidate.value === model || candidate.resolvedModel === model,
  );

  if (known !== undefined && !known.supportedEffortLevels.includes(level)) {
    throw new EffortUnsupportedError(level, model);
  }
}

/** What a category of the context window is, the CLI's own classification (plan 08, B-37). */
export type ContextKind = 'used' | 'free' | 'buffer' | 'deferred';

/** One category of the context window. */
export interface ContextCategory {
  /** A stable name for the screen to translate — `systemTools`, `messages`, `freeSpace`… */
  readonly id: string;

  /** The installation's own name, shown when this build has no words for the id. */
  readonly name: string;
  readonly tokens: number;
  readonly kind: ContextKind;
}

/** The use of a session's context window, by category, against the window of its model. */
export interface ContextUse {
  readonly model: string;
  readonly totalTokens: number;
  readonly maxTokens: number;
  readonly percentage: number;
  readonly categories: readonly ContextCategory[];
}

/** The id of a category from the name the CLI gives it: "System tools (deferred)" → `systemToolsDeferred`. */
export function categoryIdOf(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '');

  return words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join('');
}

/** How an MCP server of the session stands — never its configuration nor its raw error (B-38). */
export type McpStatus = 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';

export interface McpServer {
  readonly name: string;
  readonly status: McpStatus;
  readonly toolCount: number;
}

/** A message of a conversation, as much as choosing a fork point needs (plan 08, D-19). */
export interface ChainEntry {
  readonly id: string;

  /** A prompt somebody typed — not a tool's result, not a message of a subagent. */
  readonly isPrompt: boolean;
}

/** Where an edit-and-resend forks from. */
export type ForkPoint =
  /** The first prompt of the conversation: nothing before it is kept — a fresh conversation. */
  | { readonly kind: 'start' }
  /** Everything up to and including `keepUpTo` is kept; the turn of `dropsTurn` is discarded. */
  | { readonly kind: 'after'; readonly keepUpTo: string; readonly dropsTurn: string };

/**
 * The point to fork from, to send a prompt again — always a fork, never a truncation in place
 * (D-19): before the prompt, keeping what came before it.
 *
 * @throws {ForkPointUnknownError} `messageId` is not a prompt of the conversation (S-163)
 */
export function forkPointOf(chain: readonly ChainEntry[], messageId: string): ForkPoint {
  const at = chain.findIndex((entry) => entry.id === messageId);

  if (at === -1 || chain[at]?.isPrompt !== true) {
    throw new ForkPointUnknownError(messageId);
  }

  const before = chain[at - 1];

  return before === undefined
    ? { kind: 'start' }
    : { kind: 'after', keepUpTo: before.id, dropsTurn: messageId };
}
