/** How dangerous the backend judged an invocation. Derived there, never here. */
export type RiskHint = 'read' | 'write' | 'destructive';

/**
 * How far a decision reaches.
 *
 * `once` and `session` die with the session. `project` and `always` leave a rule that outlives it,
 * which is why they are offered only with the rule they would grant, and only behind a second step.
 */
export type PermissionScope = 'once' | 'session' | 'project' | 'always';

/** The two scopes that persist a rule, and the only two that can be revoked from `/rules`. */
export type PersistedScope = Extract<PermissionScope, 'project' | 'always'>;

/** Yes or no. There is no third value: silence is the deadline's, and it denies. */
export type PermissionDecision = 'allow' | 'deny';

/**
 * What a `project` or `always` answer would leave behind, as the server described it.
 *
 * Never derived here. The pattern is the one the backend's matcher will grant, and the lifetime is
 * the installation's — a client that computed either would show one reach and grant another
 * ([D-12](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export interface RuleOffer {
  /** In the grammar of the Claude Code settings: `Bash(git status)`. */
  readonly pattern: string;

  /** How long the rule lives, counted from the answer. */
  readonly lifetimeMs: number;
}

/** A scope the UI may offer, with the key it is labelled by. */
export interface ScopeSuggestion {
  readonly scope: PermissionScope;

  /** An i18n key. The server never sends prose, not even inside a suggestion. */
  readonly labelKey: string;

  /** The rule a persisted scope would grant; `null` on the two that die with the session. */
  readonly rule: RuleOffer | null;
}

/**
 * One question on screen, waiting for a person.
 *
 * `frameId` is what the answer correlates to — the request is a `request` frame, and answering it
 * is a `response` that names it. Idempotency, on the other hand, is by `requestId` and never by
 * `toolUseId`.
 */
export interface PermissionRequest {
  readonly requestId: string;
  readonly frameId: string;
  readonly toolUseId: string;
  readonly toolName: string;

  /** The detail a person decides on: the command line, the path being written. */
  readonly description: string | null;

  /** The exact input the tool would run with. What is shown is what executes. */
  readonly input: Readonly<Record<string, unknown>>;

  readonly riskHint: RiskHint;

  /** The UI pre-selects refusal. Silence never authorises. */
  readonly defaultToNo: boolean;

  /** When the deadline refuses it, ISO 8601 in UTC. */
  readonly expiresAt: string;

  readonly suggestions: readonly ScopeSuggestion[];

  /**
   * An answer of ours is in flight.
   *
   * While it holds, the card takes no second click: two clicks are two answers, and the second is
   * at best wasted and at worst a different decision than the one shown.
   */
  readonly isAnswering: boolean;
}

/** How a request left the queue, for the line the UI shows afterwards. */
export interface PermissionOutcome {
  readonly requestId: string;
  readonly decision: PermissionDecision;

  /** The server decided it: the deadline passed, or a rule matched. */
  readonly auto: boolean;

  /** Who answered, when somebody did. */
  readonly resolvedBy: string | null;
}
