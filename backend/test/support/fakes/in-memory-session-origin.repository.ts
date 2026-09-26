import type { SessionOrigin, SessionOriginRepository } from '@application/session';
import type { UserId } from '@domain/auth';
import type { ClaudeSessionId } from '@domain/transcript';

/**
 * The provenance of our sessions, in a map keyed as the table is — by the conversation's id — so a
 * second record of the same conversation keeps the first, exactly as the table's conflict does.
 */
export class InMemorySessionOriginRepository implements SessionOriginRepository {
  readonly rows = new Map<string, SessionOrigin>();

  /** Set to make the next writes fail, the way a database that went away does. */
  failWith: Error | null = null;

  record(origin: SessionOrigin): Promise<void> {
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }

    if (!this.rows.has(origin.claudeSessionId.value)) {
      this.rows.set(origin.claudeSessionId.value, origin);
    }

    return Promise.resolve();
  }

  openersOf(ids: readonly ClaudeSessionId[]): Promise<ReadonlyMap<string, UserId>> {
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const row = this.rows.get(id.value);
          return row === undefined ? [] : [[id.value, row.openedBy] as const];
        }),
      ),
    );
  }
}
