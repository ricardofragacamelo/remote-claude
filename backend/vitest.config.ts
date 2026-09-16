import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

import { COVERAGE_THRESHOLDS } from '../scripts/lib/coverage.mjs';

/**
 * One runner for both suites.
 *
 * Coverage is measured over unit **and** integration together, because each layer is covered by
 * the level that makes sense for it: a repository proved against a real PostgreSQL, a use case
 * proved with fakes. Running only the unit suite and demanding 90 % pushes the code towards
 * artificial adapter tests — see docs/architecture/shared/06-testing-strategy.md#cobertura.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: {
    // Nest's decorators are the legacy ones; esbuild only emits them when it is told so here.
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
    },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 20_000,
    // A container takes seconds to start, and it starts once per suite, in a hook.
    hookTimeout: 180_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Entry points: they read argv or the environment, wire the container and exit. Both are
        // exercised end to end — `main.ts` by the e2e run, the database CLI by `pnpm db`, whose
        // operations are covered in test/integration/infrastructure/database.
        'src/main.ts',
        'src/infrastructure/database/cli.ts',
        // Pure framework wiring: declarations, no branches. The integration suite exercises it.
        'src/**/*.module.ts',
        // Barrels re-export and decide nothing.
        'src/**/index.ts',
        // DI tokens: a list of symbols.
        'src/**/*.tokens.ts',
      ],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});
