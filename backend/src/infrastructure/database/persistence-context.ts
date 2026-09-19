import type { Clock } from '@domain/shared';
import type { Logger } from '@shared/logging/logger';
import type { Database } from './connection';

/**
 * The three things every repository needs.
 *
 * Bundled rather than injected one by one, because every repository in this backend wanted the
 * same three and said so in the same seven lines. One token means one place to change the day a
 * fourth is needed, and no repository whose constructor has quietly drifted from its neighbours'.
 */
export interface PersistenceContext {
  readonly db: Database;

  /** Timestamps are stamped by the application, never left to a database default. */
  readonly clock: Clock;

  /** Every query is logged at `debug`, parameterised and with a duration. */
  readonly logger: Logger;
}

export const PERSISTENCE_CONTEXT = Symbol('PersistenceContext');
