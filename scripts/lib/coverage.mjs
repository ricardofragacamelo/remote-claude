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

/**
 * Files of the app the coverage bar does not apply to, each for a stated reason — read by the gate
 * (`mobile.mjs coverage`) and by `coverage-gaps.mjs`.
 *
 * Generated code is written by nobody, and `main.dart` is four calls into things that are
 * themselves covered — the same exception `main.ts` carries on the backend.
 */
export const MOBILE_COVERAGE_EXCLUSIONS = [
  '**/*.g.dart',
  '**/*.freezed.dart',
  'lib/l10n/generated/**',
  'lib/main.dart',

  // Fixtures the architecture test writes into `lib/` for the length of one test — `import_lint`
  // only analyses `lib/`, so a deliberate violation has to live there. They hold one import and
  // nothing else, and they are deleted in the same test; measuring them would make the number
  // depend on which suite happened to be running.
  'lib/**/_arch_*.dart',
];
