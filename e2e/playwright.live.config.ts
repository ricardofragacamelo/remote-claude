import { defineConfig, devices } from '@playwright/test';

import { shared } from './playwright.shared';

/**
 * The one suite that is not hermetic.
 *
 * `smoke-live/` talks to the real Claude Code on this machine, and it exists to catch the thing
 * nothing else can: the SDK changing its contract under us.
 *
 * It is slower by a different order of magnitude — a real turn is seconds to minutes — and that is
 * the only thing it relaxes. `retries: 0` still holds: a retry here would hide exactly what this
 * exists to catch.
 *
 * Run it with `pnpm test:e2e:live`, which brings the stack up with the **product's** entry point
 * rather than the scripted one. See docs/architecture/shared/06-testing-strategy.md.
 *
 * Two projects, not one shared `testMatch` (plan 13, B-46, S-197): `smoke-live-isolated` is the
 * one spec built for the `CLAUDE_CONFIG_DIR` `run-e2e-local.mjs --live-isolated` builds on
 * purpose. Running it under the plain `smoke-live` project would read the developer's own
 * `~/.claude` instead — the opposite of what it exists to prove — so `run-e2e-local.mjs` always
 * names the one project it wants, never both at once.
 */
export default defineConfig({
  ...shared,

  projects: [
    {
      name: 'smoke-live',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['smoke-live/**/*.spec.ts'],
      testIgnore: ['smoke-live/claude-settings-isolated.spec.ts'],
    },
    {
      name: 'smoke-live-isolated',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['smoke-live/claude-settings-isolated.spec.ts'],
    },
  ],

  // A real turn on a real model, on somebody's laptop. Ten minutes is generous on purpose: a
  // timeout that fires on a slow machine reports "the SDK changed" when nothing did.
  timeout: 600_000,
  expect: { timeout: 60_000 },
});
