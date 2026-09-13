import { defineConfig } from 'vitest/config';

// Unit suite of the repository-level scripts. Each workspace brings its own config; this one
// only covers `scripts/`, whose tests live in `test/unit/`, outside the code they exercise —
// docs/architecture/shared/06-testing-strategy.md.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.spec.mjs', 'test/integration/**/*.spec.mjs'],
    environment: 'node',
    coverage: {
      include: ['scripts/**/*.mjs'],
      reporter: ['text', 'lcov'],
    },
  },
});
