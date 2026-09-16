import { defineConfig } from 'vitest/config';

import { COVERAGE_THRESHOLDS } from './scripts/lib/coverage.mjs';

// Unit and integration suites of the repository-level scripts. Each workspace brings its own
// config; this one only covers `scripts/`, whose tests live in `test/`, outside the code they
// exercise — docs/architecture/shared/06-testing-strategy.md.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.spec.mjs', 'test/integration/**/*.spec.mjs'],
    environment: 'node',
    coverage: {
      include: ['scripts/**/*.mjs'],

      // The entry points are processes, not modules: nothing imports them, and what they owe is
      // an exit code and an output. That contract is checked in `test/integration/scripts/`, by
      // running them — the same reason the backend excludes `main.ts` and `database/cli.ts`.
      // Their logic lives in `scripts/lib/`, which is measured in full.
      exclude: ['scripts/*.mjs'],

      thresholds: COVERAGE_THRESHOLDS,
      reporter: ['text', 'lcov'],
    },
  },
});
