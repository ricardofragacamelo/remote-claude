import { sql } from 'drizzle-orm';

import type { Transaction } from '@infra/database/connection';
import type { Logger } from '@shared/logging/logger';
import { describedBy, runLogged } from './query-logging';

/**
 * Serialises, for the rest of a transaction, every other transaction that takes the same key.
 *
 * Transaction-scoped: the commit or the rollback releases it, so it never outlives the write it
 * guards. For a decision a unique index cannot state — "at most eight tabs", "at most two hundred
 * entries" — two writers that both read the state before either commits would each decide on a
 * state the other is about to change.
 *
 * `shared` lets every other shared holder in and keeps an exclusive one out: many writers may each
 * add what one sweeper must not see half done — the local history writes a blob and the row that
 * names it under the shared lock, and its purge sweeps under the exclusive one (plan 07, B-56).
 *
 * @param key the parts of the key, joined as JSON rather than by a separator — no character is safe
 *   to join on when a part is text somebody else chose
 */
export async function lockForTransaction(
  tx: Transaction,
  logger: Logger,
  operation: string,
  key: readonly string[],
  mode: 'exclusive' | 'shared' = 'exclusive',
): Promise<void> {
  const text = JSON.stringify(key);
  const statement =
    mode === 'shared'
      ? sql`SELECT pg_advisory_xact_lock_shared(hashtext(${text}))`
      : sql`SELECT pg_advisory_xact_lock(hashtext(${text}))`;

  await runLogged(logger, operation, describedBy(tx.execute(statement)));
}
