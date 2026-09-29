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
 * @param key the parts of the key, joined as JSON rather than by a separator — no character is safe
 *   to join on when a part is text somebody else chose
 */
export async function lockForTransaction(
  tx: Transaction,
  logger: Logger,
  operation: string,
  key: readonly string[],
): Promise<void> {
  const text = JSON.stringify(key);

  await runLogged(
    logger,
    operation,
    describedBy(tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${text}))`)),
  );
}
