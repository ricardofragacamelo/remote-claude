import type { RateLimitStore } from '@application/engines/claude';
import type { RateLimitWindow } from '@domain/engines/claude';

/**
 * The in-memory latest reading of each rate-limit window — a map keyed by `kind`, one entry per
 * window (plan 16, D-09, cut down for this round: no persistence, so a restart forgets what was
 * last seen until the next `rate_limit_event` arrives).
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, RateLimitWindow>();

  observe(window: RateLimitWindow): void {
    this.windows.set(window.kind, window);
  }

  current(): readonly RateLimitWindow[] {
    return [...this.windows.values()];
  }
}

/**
 * The one instance of this process.
 *
 * The session module and `ClaudeSettingsModule` deliberately never import one another — every other
 * thing a session needs that the settings module also provides is instead built a second time, from
 * the same validated loader (see the comments on `CLAUDE_SESSION_EXTENSION_PATHS` and
 * `CLAUDE_PROJECT_MCP_SOURCE` in `claude.providers.ts`). Rate limits cannot follow that pattern: a
 * second instance would never see what the first one observed, and the screen would always read
 * empty. Both wiring sites `useValue` this one object — a plain module-scope singleton, not a
 * NestJS-scoped one, which is what keeps it a single shared store without either module importing
 * the other.
 */
export const sharedRateLimitStore: RateLimitStore = new InMemoryRateLimitStore();
