import type { FolderAccess } from '@application/agent-settings';
import { SingleFlight } from '@application/shared';
import type { UserId } from '@domain/auth';
import type { RateLimitWindow } from '@domain/engines/claude';
import type { Clock } from '@domain/shared';
import type { RateLimitStore } from './ports/rate-limit-store.port';
import type { UsageProbe } from './ports/usage-probe.port';

/** How long a usage probe's answer is trusted before the next read probes again. */
export const USAGE_PROBE_TTL_MS = 30_000;

/**
 * `GET /engines/claude/usage/rate-limits` — the rate-limit windows of the account the CLI is signed
 * in to, each as it was last seen (plan 16, D-09).
 *
 * Shown to every authenticated user, with no folder and no ownership check: the account is the
 * machine's, shared by every session of every user of this installation, exactly like
 * `ReadAccountUseCase` shows the same account to everyone (D-07) — the folder a caller's own `userId`
 * resolves to is used only to spawn the probe, never to scope what the answer shows.
 *
 * A window `SessionRunner` has pushed from a live session is already in the store and costs nothing
 * to read; the probe exists for the window nothing has pushed yet, or whose reading has gone stale —
 * throttled to once per {@link USAGE_PROBE_TTL_MS} and de-duplicated with {@link SingleFlight}, so a
 * screen polling every minute, from any number of open tabs, spawns at most one subprocess for it.
 */
export class ReadRateLimitsUseCase {
  private lastProbedAt: number | null = null;
  private readonly inFlight = new SingleFlight<void>();

  constructor(
    private readonly store: RateLimitStore,
    private readonly probe: UsageProbe,
    private readonly folders: FolderAccess,
    private readonly clock: Clock,
  ) {}

  async execute(userId: UserId): Promise<readonly RateLimitWindow[]> {
    await this.probeIfStale(userId);
    return this.store.current();
  }

  private async probeIfStale(userId: UserId): Promise<void> {
    if (!this.stale()) {
      return;
    }

    const root = await this.folders.firstRoot(userId);
    if (root === null) {
      // Nobody has a root at all — the same situation the account screen reads as "nothing to
      // probe", not as a reason to refuse the whole read: the store may still hold a live reading.
      return;
    }

    await this.inFlight.run('usage-probe', async () => {
      // Another call may have just finished probing while this one waited its turn.
      if (!this.stale()) {
        return;
      }

      for (const window of await this.probe.probe(root)) {
        this.store.observe(window);
      }
      this.lastProbedAt = this.clock.now().getTime();
    });
  }

  private stale(): boolean {
    return (
      this.lastProbedAt === null ||
      this.clock.now().getTime() - this.lastProbedAt > USAGE_PROBE_TTL_MS
    );
  }
}
