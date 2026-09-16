import { defineConfig, devices } from '@playwright/test';

import { environment } from './fixtures/environment';

/**
 * Gate 9.
 *
 * The suite never starts a stack of its own — `scripts/run-e2e-local.mjs` does, on random ports,
 * under a compose project unique to the run, and writes `e2e/.env` with the addresses. A
 * `webServer` block here would be a second implementation of that, and it could not bring
 * PostgreSQL and Keycloak with it.
 *
 * `retries: 0`, everywhere. A retry turns a flaky test into a test that passes eventually, which
 * is how a real intermittent bug gets shipped — see docs/architecture/shared/06-testing-strategy.md.
 */
export default defineConfig({
  testDir: '.',

  // `smoke-live/` talks to the real Claude: slow, not hermetic, and never part of a pull request.
  // It is run on demand and nightly, by naming it explicitly.
  testIgnore: ['smoke-live/**'],
  testMatch: ['specs/**/*.spec.ts'],

  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,

  timeout: 120_000,
  expect: { timeout: 15_000 },

  // `list`, everywhere. A reporter chosen from the environment means the output a person reads
  // while debugging is not the output CI produced, and `.env.example` would have to declare a
  // variable this repository does not own.
  reporter: [['list']],

  use: {
    baseURL: environment.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
