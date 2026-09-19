import { devices } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';

import { environment } from './fixtures/environment';

/**
 * What both configurations share, and why they are two configurations at all.
 *
 * `smoke-live/` talks to the real Claude, so it lives behind a file of its own rather than behind
 * a flag on the default one: a suite that can be included by forgetting a flag is a suite that
 * eventually runs in CI and starts costing money. What they differ in — which directory they
 * match, and how long a turn is allowed to take — is stated in each; everything else is here,
 * because two copies of the browser or the trace policy is two places for a run to stop resembling
 * the other.
 *
 * `retries: 0`, in both. A retry turns a flaky test into a test that passes eventually, which is
 * how a real intermittent bug gets shipped — docs/architecture/shared/06-testing-strategy.md.
 */
export const shared = {
  testDir: '.',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,

  // `list`, in both. A reporter chosen from the environment means the output a person reads while
  // debugging is not the output CI produced, and `.env.example` would have to declare a variable
  // this repository does not own.
  reporter: [['list']],

  use: {
    baseURL: environment.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
} satisfies PlaywrightTestConfig;
