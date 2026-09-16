/**
 * The coverage bar, in one place.
 *
 * **90 % in statements, branches, functions and lines — per file.** There is no average that makes
 * up for a gap: a module at 70 % is not rescued by another at 99 %. `branches` is the dimension
 * that actually fails, and it is the one that says whether the error paths were tested.
 *
 * It lives here, in `scripts/lib/`, because both workspace runners read it and because a threshold
 * copied into two configs is a threshold that gets lowered in one of them.
 *
 * See docs/architecture/shared/06-testing-strategy.md#cobertura.
 *
 * @type {{ statements: number, branches: number, functions: number, lines: number, perFile: true }}
 */
export const COVERAGE_THRESHOLDS = {
  statements: 90,
  branches: 90,
  functions: 90,
  lines: 90,
  perFile: true,
};
