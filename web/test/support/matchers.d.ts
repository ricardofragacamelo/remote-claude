import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/**
 * The matchers the setup file registers, declared for the type checker.
 *
 * `expect.extend` is a runtime call; without this the suite type-checks as if `toBeInTheDocument`
 * did not exist.
 */
declare module 'vitest' {
  interface Matchers<T = unknown> extends TestingLibraryMatchers<(value: string) => unknown, T> {
    /** From `jest-axe`: the rendered tree has no accessibility violation. */
    toHaveNoViolations(): T;
  }
}
