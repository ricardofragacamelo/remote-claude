import type { Logger } from '@shared/logging/logger';

/** Above this a query is an anomaly, not a fact: it is what points at a missing index. */
export const SLOW_QUERY_MS = 200;

/** A Drizzle builder: awaitable, and able to describe itself before it runs. */
export interface LoggableQuery<T> extends PromiseLike<T> {
  toSQL(): { sql: string; params: unknown[] };
}

/**
 * Runs a query and logs both sides of the database edge.
 *
 * The **parameterised** SQL is logged, never the interpolated one, and the values are counted
 * rather than printed: a query log that carries its own arguments is a query log that eventually
 * carries a token. See docs/architecture/shared/03-logging.md.
 */
export async function runLogged<T>(
  logger: Logger,
  op: string,
  query: LoggableQuery<T>,
): Promise<T> {
  const { sql, params } = query.toSQL();
  const startedAt = Date.now();
  const result = await query;
  const durationMs = Date.now() - startedAt;

  const context = {
    op: 'db.query',
    layer: 'adapter',
    operation: op,
    sql,
    params: params.length,
    durationMs,
  };

  if (durationMs > SLOW_QUERY_MS) {
    logger.warn(context, 'slow database query');
  } else {
    logger.debug(context, 'database query');
  }

  return result;
}
