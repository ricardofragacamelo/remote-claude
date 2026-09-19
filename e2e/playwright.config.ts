import { defineConfig } from '@playwright/test';

import { shared } from './playwright.shared';

/**
 * Gate 9.
 *
 * The suite never starts a stack of its own — `scripts/run-e2e-local.mjs` does, on random ports,
 * under a compose project unique to the run, and writes `e2e/.env` with the addresses. A
 * `webServer` block here would be a second implementation of that, and it could not bring
 * PostgreSQL and Keycloak with it.
 *
 * The Agent SDK behind that stack is a **replay of a recorded run**: an end-to-end test has to be
 * deterministic and Claude is not, and each real run costs money.
 */
export default defineConfig({
  ...shared,

  // `smoke-live/` talks to the real Claude: slow, not hermetic, and never part of a pull request.
  // It has a configuration of its own, and this one refuses to pick it up by accident.
  testIgnore: ['smoke-live/**'],
  testMatch: ['specs/**/*.spec.ts'],

  timeout: 120_000,
  expect: { timeout: 15_000 },
});
