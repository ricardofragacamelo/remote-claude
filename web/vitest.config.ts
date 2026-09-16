import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

import { COVERAGE_THRESHOLDS } from '../scripts/lib/coverage.mjs';

import { browserDefine, browserEnvironment } from './env';

/**
 * One runner for both suites, with coverage measured over the two together.
 *
 * `jsdom`, and the real i18n provider inside it: a `t()` stubbed to return its own key hides a
 * missing translation, which is exactly the bug the test is there to catch —
 * docs/architecture/web/06-testing.md.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  // The same settings the build injects, so the configuration module under test is the real one.
  define: browserDefine(browserEnvironment({}, '0.0.0-test')),
  test: {
    include: ['test/**/*.spec.{ts,tsx}'],
    environment: 'jsdom',
    globals: false,
    setupFiles: ['test/support/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // The entry point: covered by the e2e run, with nothing to assert on in isolation.
        'src/main.tsx',
        // Generated primitives, tested upstream. What we test is our use of them.
        'src/shared/components/ui/**',
        // Barrels re-export and decide nothing.
        'src/**/index.ts',
        // Type declarations.
        'src/**/*.d.ts',
      ],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
});
