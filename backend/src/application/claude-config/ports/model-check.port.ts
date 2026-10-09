/** What the test of the connection to the model found — data of the answer, never an error. */
export type ModelCheckResult = 'ok' | 'notLoggedIn' | 'rateLimited' | 'failed';

/** One test of the connection, as the screen shows it (plan 13, B-12). */
export interface ModelCheckOutcome {
  readonly result: ModelCheckResult;

  /** The model that answered, when one did. */
  readonly model: string | null;
  readonly latencyMs: number;

  /** What the turn cost, as the CLI reported it; `null` when it said nothing. */
  readonly costUsd: number | null;

  /** Why it did not pass, as a stable word the screen translates (`authentication`, `billing`…). */
  readonly reason: string | null;
  readonly at: Date;
}

/**
 * One turn with a fixed minimal prompt, no tools, one turn, a spending ceiling — the only thing this
 * plan does that spends quota, and only on a click (D-08).
 */
export interface ModelCheck {
  /**
   * @param model the model to test, or `null` for the installation's
   * @throws {import('@domain/session').SessionLimitReachedError} no slot
   * @throws {import('@domain/session').ClaudeUnavailableError} the CLI died
   * @throws {import('@domain/session').ClaudeTimeoutError} the CLI did not answer in time
   */
  run(model: string | null): Promise<Omit<ModelCheckOutcome, 'at'>>;
}

export const MODEL_CHECK = Symbol('ModelCheck');
