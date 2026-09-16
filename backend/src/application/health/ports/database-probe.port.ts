/**
 * Whether the database answers.
 *
 * `SELECT 1`, never a business query: a health check that reads a table starts failing for
 * reasons that have nothing to do with health. See docs/architecture/backend/05-persistence.md.
 */
export interface DatabaseProbe {
  /** `true` when the database answered, `false` when it did not. Never throws. */
  isReachable(): Promise<boolean>;
}

export const DATABASE_PROBE = Symbol('DatabaseProbe');
