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
  /**
   * The `exact` pattern, in the grammar of the Claude Code settings: `Bash(git status)`. `null`
   * when the invocation has no exact reach — the patterns of the others travel in `reaches`.
   */
  readonly pattern: string | null;

  /** How long the rule lives, counted from the answer. */
  readonly lifetimeMs: number;
}

/** How far a rule left by an answer reaches (plan 23, B-13). */
export type RuleReachKind = 'exact' | 'prefix' | 'tool';

/** One reach the server offered, with the rules it would leave — one per pattern. */
export interface RuleReach {
  readonly reach: RuleReachKind;
  readonly patterns: readonly string[];
}

/** One option of a question, as the server published it — its label exact, to answer with. */
export interface QuestionOption {
  readonly label: string;
  readonly description: string;

  /** Markdown, rendered safely; `null` when the option has none. */
  readonly preview: string | null;
}

/** One question of Claude, normalised by the server (plan 24). */
export interface Question {
  /** `q1`…`q4` — what an answer names. */
  readonly id: string;
  readonly header: string;
  readonly prompt: string;
  readonly multiSelect: boolean;
  readonly options: readonly QuestionOption[];
}

/**
 * Claude asking the person something, rather than asking leave to run a tool. `malformed` is a
 * question nobody can read safely — on the server's word, or this build's: it can only be refused.
 */
export interface QuestionInteraction {
  readonly malformed: boolean;
  readonly questions: readonly Question[];
}

/** What a person answered to one question: the labels and the free answer, apart. */
export interface QuestionAnswer {
  readonly questionId: string;
  readonly selected: readonly string[];

  /** The free answer ("Other"); `null` when there is none. */
  readonly other: string | null;
}

/**
 * What a person has chosen so far on the card of a question — kept by request, outside the card, so
 * a dropped socket or the replay of an attach never loses it (plan 24, R-06).
 */
export interface QuestionDraft {
  /** The question on screen. */
  readonly step: number;
  readonly selected: Readonly<Record<string, readonly string[]>>;

  /** The free answer of each question: its text when "Other" is marked, `null` or absent when not. */
  readonly other: Readonly<Record<string, string | null>>;
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
   * How far a rule left by the answer may reach, as the server computed it — the card offers a
   * choice when there is more than one, and the answer names one, never a pattern.
   */
  readonly reaches: readonly RuleReach[];

  /** The questions, when the request is a question of Claude — `null` for every other request. */
  readonly interaction: QuestionInteraction | null;

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

  /** The server decided it: the deadline passed, a rule matched, or Permitir tudo answered. */
  readonly auto: boolean;

  /** What answered when nobody was asked: a rule, or Permitir tudo. `null` otherwise. */
  readonly via: 'rule' | 'allowAll' | null;

  /** Who answered, when somebody did. */
  readonly resolvedBy: string | null;

  /** The client the answer came from — `web` or `mobile` —, when the server said. */
  readonly resolvedFrom: string | null;

  /**
   * The tool the request was about — what the conversation draws the decision on, in the place of
   * the card (plan 09, B-23). `null` for a request this screen never saw asked: a rule settled it.
   */
  readonly toolUseId: string | null;

  /** This screen sent the answer that won — "allowed by you". */
  readonly answeredHere: boolean;

  /** The questions, when the request was one — what the line of its tool draws (plan 24, B-15). */
  readonly interaction: QuestionInteraction | null;

  /** What was answered, when the request was a question and the decision `allow`. */
  readonly answers: readonly QuestionAnswer[] | null;
}
