import { EffortUnsupportedError } from '../errors/effort-unsupported.error';
import { ForkPointUnknownError } from '../errors/fork-point-unknown.error';
import type { SlashCommand } from './slash-commands';

/** The levels of effort an engine may take — the ones it takes are its capability (`effortLevels`). */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/** A model the installation offers, as the session's selector shows it (plan 08, B-36). */
export interface InstallationModel {
  /** What `setModel` and `session.start.model` take. */
  readonly value: string;

  /** The id an alias resolves to, when the installation says. */
  readonly resolvedModel: string | null;

  /** Data of the installation, shown as it is — like the description of a slash command. */
  readonly displayName: string;
  readonly description: string;

  /** The levels of effort it takes — empty when it takes none, which is all a screen needs to know. */
  readonly supportedEffortLevels: readonly EffortLevel[];
}

/**
 * The account an engine's installation is signed in to — who, which organisation, which plan, which
 * provider. Never a token, never the path of a credential (plan 13, D-07); what else an engine says
 * of its login is its extension's.
 */
export interface InstallationAccount {
  readonly email: string | null;
  readonly organization: string | null;
  readonly plan: string | null;
  readonly provider: string | null;
}

/** A subagent the installation offers. */
export interface InstallationAgent {
  readonly name: string;
  readonly description: string;
  readonly model: string | null;
}

/**
 * What an installation says about itself in one question (plan 13, D-05): its commands, agents,
 * models and account. An engine's adapter may say more — its extension reads it.
 */
export interface SessionInitialization {
  readonly commands: readonly SlashCommand[];
  readonly agents: readonly InstallationAgent[];
  readonly models: readonly InstallationModel[];
  readonly account: InstallationAccount;
}

/**
 * Refuses an effort the model does not take — none at all, or not that level (D-16, S-171).
 *
 * A model the list does not name is not refused: the list is discovery, and a model set by its full
 * id is matched by what the aliases resolve to, or not at all.
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

/**
 * The categories every engine's context window has, by our own id — each with its own words on the
 * screens (plan 28, B-24): the system prompt, the tools, the conversation, the memory, what is free,
 * and what the engine keeps aside.
 */
export const CONTEXT_CATEGORIES = [
  'system',
  'tools',
  'messages',
  'memory',
  'free',
  'reserved',
] as const;

/** One of the canonical categories. */
export type CanonicalContextCategory = (typeof CONTEXT_CATEGORIES)[number];

/** One category of the context window. */
export interface ContextCategory {
  /**
   * A canonical id (`system`, `tools`, `messages`, `memory`, `free`, `reserved`) — or, for what only
   * one engine counts apart, a stable id of its own, opaque to the screens.
   */
  readonly id: string;

  /** The key a screen translates — `sessions.context.<id>` — for a canonical category; `null` otherwise. */
  readonly messageKey: string | null;

  /** The engine's own name for it, shown when there is no key. */
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

/**
 * A category of [id] and [name], under its canonical id with its key when [canonical] names one.
 *
 * @param canonical the canonical category the engine's adapter reads it as, when there is one
 */
export function contextCategory(
  id: string,
  name: string,
  tokens: number,
  kind: ContextKind,
  canonical: CanonicalContextCategory | null,
): ContextCategory {
  return canonical === null
    ? { id, messageKey: null, name, tokens, kind }
    : { id: canonical, messageKey: `sessions.context.${canonical}`, name, tokens, kind };
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

/**
 * Where a server's definition came from, read off the engine's own `source` field and never off its
 * name (plan 13, B-22, S-93): `ours` is a server composed from the store, `project` an approved entry
 * of the engine's own project file (both reach the engine the same way), `plugin` one a plugin
 * brought, `other` anything else — never trusted as ours, whatever it is named.
 */
export type McpSource = 'ours' | 'project' | 'plugin' | 'other';

export interface McpServer {
  readonly name: string;
  readonly status: McpStatus;
  readonly source: McpSource;
  readonly toolCount: number;

  /** Why it failed, redacted — absent unless `status` is `failed` (plan 13, B-22, S-96). */
  readonly error?: string;
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
