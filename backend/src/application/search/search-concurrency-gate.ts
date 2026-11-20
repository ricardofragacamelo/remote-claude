import { SearchRateLimitedError } from '@domain/search';

/**
 * How many searches one user may have running at once — S-73, S-74.
 *
 * In memory, by design: the ceiling is per **this** backend process, which is what the user is
 * actually talking to; a multi-instance deployment is out of this plan's scope, the same as every
 * other in-process limiter this backend already has.
 */
export class SearchConcurrencyGate {
  private readonly activeByUser = new Map<string, number>();

  constructor(private readonly maxPerUser: number) {}

  /** @throws {SearchRateLimitedError} `scope: 'search'` — the caller already has {@link maxPerUser} running */
  acquire(userId: string): void {
    const active = this.activeByUser.get(userId) ?? 0;
    if (active >= this.maxPerUser) {
      throw new SearchRateLimitedError('search', this.maxPerUser, 1);
    }
    this.activeByUser.set(userId, active + 1);
  }

  /** Always called, success or failure — a leaked slot would starve the user it belongs to. */
  release(userId: string): void {
    const active = this.activeByUser.get(userId) ?? 0;
    if (active <= 1) {
      this.activeByUser.delete(userId);
    } else {
      this.activeByUser.set(userId, active - 1);
    }
  }
}
