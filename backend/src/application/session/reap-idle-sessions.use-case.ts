import type { Clock } from '@domain/shared';
import type { SessionEnder } from './session-ender';
import type { SessionRegistry } from './session-registry';

/**
 * Puts away the sessions nobody has used for longer than the TTL — B-02.
 *
 * Each one is ~222 MB and a subprocess on somebody's machine, and a tab left open over a weekend
 * should not cost that until Monday. What counts as idle is the session's to say
 * (`Session.isIdleFor`): only `idle`, never a running turn and **never a pending permission** —
 * that wait is the product working (S-05). A client merely attached does not keep a session alive:
 * the conversation is in the history and resumes from there
 * ([D-02](../../../../docs/plans/05-hardening-operations/decisions.md)).
 *
 * Every candidate is chosen and marked closed in the same turn of the event loop, so a command
 * cannot slip in between "this one is idle" and "this one is closing".
 */
export class ReapIdleSessionsUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly ender: SessionEnder,
    private readonly clock: Clock,
    private readonly ttlMs: number,
  ) {}

  /** @returns how many sessions were put away */
  async execute(): Promise<number> {
    const now = this.clock.now();
    const idle = this.registry.all().filter((live) => live.session.isIdleFor(this.ttlMs, now));

    // `allSettled`: one subprocess that fails to close must not keep the others alive. The ender
    // has already forgotten it either way.
    await Promise.allSettled(idle.map((live) => this.ender.end(live, 'idleTimeout')));

    return idle.length;
  }
}
