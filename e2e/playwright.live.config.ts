import { defineConfig } from '@playwright/test';

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
 */
export default defineConfig({
  ...shared,

  testMatch: ['smoke-live/**/*.spec.ts'],

  // A real turn on a real model, on somebody's laptop. Ten minutes is generous on purpose: a
  // timeout that fires on a slow machine reports "the SDK changed" when nothing did.
  timeout: 600_000,
  expect: { timeout: 60_000 },
});
