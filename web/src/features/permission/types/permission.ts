/** How dangerous the backend judged an invocation. Derived there, never here. */
export type RiskHint = 'read' | 'write' | 'destructive';

/** How far a decision reaches. Only the two that die with the session exist in this build. */
export type PermissionScope = 'once' | 'session';

/** Yes or no. There is no third value: silence is the deadline's, and it denies. */
export type PermissionDecision = 'allow' | 'deny';

/** A scope the UI may offer, with the key it is labelled by. */
export interface ScopeSuggestion {
  readonly scope: PermissionScope;

  /** An i18n key. The server never sends prose, not even inside a suggestion. */
  readonly labelKey: string;
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
