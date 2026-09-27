import type { SessionEnder } from './session-ender';
import type { SessionRegistry } from './session-registry';

/**
 * The two steps of the shutdown that belong to sessions — B-04.
 *
 * Two methods and not one, because the socket closing sits **between** them in
 * docs/architecture/backend/06-realtime.md#shutdown: every session is told it is over while the
 * sockets can still carry the news, then the sockets close with `1001`, and only then does every
 * subprocess go. The order across the two is the caller's; each step here is idempotent, so a
 * shutdown asked for twice does nothing the second time (S-14).
 */
export class ShutdownSessionsUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly ender: SessionEnder,
  ) {}

  /** Step 2: `session.closed { reason: 'shutdown' }` for every live session. */
  announce(): number {
    return this.registry.all().filter((live) => this.ender.announce(live, 'shutdown')).length;
  }

  /**
   * Step 4: `query.close()` on **every** live session. Skipping it leaves CLI processes orphaned on
   * the user's machine.
   *
   * @returns how many subprocesses were closed, and how many refused — the refusals are forgotten
   *   anyway, and the boot sweep is what catches one that survived
   */
  async release(): Promise<{ readonly closed: number; readonly failed: number }> {
    const outcomes = await Promise.allSettled(
      this.registry.all().map((live) => this.ender.release(live)),
    );

    const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length;
    return { closed: outcomes.length - failed, failed };
  }
}
