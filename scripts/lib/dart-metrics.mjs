/**
 * Reading what `dart_code_linter`'s metrics report prints.
 *
 * It lives apart from the script that runs the tool for the reason `import-lint.mjs` does: the
 * output is the evidence, and reading it is the part that has to be tested. The exit code alone
 * is not enough either way — `2` says *something* crossed the bar without saying what, and `0`
 * from a run that never finished analysing would look exactly like a clean one.
 *
 * The bar itself is in `mobile/analysis_options.yaml` (D-10 of plan 05).
 */

/** The code the tool exits with when a metric crossed its threshold. */
export const VIOLATION_EXIT_CODE = 2;

/** Printed once the analysis finished; a run without it did not look at the code. */
const COMPLETED = 'Analysis is completed';

/** Cursor movement and colour, which the tool's progress spinner is made of. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

const FILE = /^(\S.*\.dart):$/;
const MEMBER = /^(?:WARNING|ALARM)\s+(\S.*?)\s*$/;
const VALUE = /^\s+cyclomatic complexity:\s+(\d+)\s*$/;

/**
 * @typedef {object} ComplexityViolation
 * @property {string} file path of the file, relative to the module
 * @property {string} member the function or method, as `Class.method`
 * @property {number} value its cyclomatic complexity
 */

/**
 * @param {string} output what the tool printed
 * @returns {ComplexityViolation[]}
 */
export function parseComplexity(output) {
  /** @type {ComplexityViolation[]} */
  const violations = [];
  let file = '';
  let member = '';

  for (const raw of output.replace(ANSI, '').split(/\r?\n|\r/)) {
    const fileMatch = FILE.exec(raw);
    const memberMatch = MEMBER.exec(raw);
    const valueMatch = VALUE.exec(raw);

    if (fileMatch !== null) {
      file = String(fileMatch[1]);
    } else if (memberMatch !== null) {
      member = String(memberMatch[1]);
    } else if (valueMatch !== null && member !== '') {
      violations.push({ file, member, value: Number(valueMatch[1]) });
      member = '';
    }
  }

  return violations;
}

/**
 * @typedef {{ kind: 'clean' }
 *   | { kind: 'violations', violations: ComplexityViolation[] }
 *   | { kind: 'broken', reason: string }} ComplexityVerdict
 */

/**
 * What one run of the tool means.
 *
 * Anything that is not a finished analysis is `broken`, never `clean`: a checker that could not
 * run is not a checker that found nothing.
 *
 * @param {number} code the tool's exit code
 * @param {string} output what it printed, stdout and stderr together
 * @returns {ComplexityVerdict}
 */
export function complexityVerdict(code, output) {
  const violations = parseComplexity(output);

  if (code === 0 && output.includes(COMPLETED)) {
    return { kind: 'clean' };
  }

  if (code === VIOLATION_EXIT_CODE && violations.length > 0) {
    return { kind: 'violations', violations };
  }

  if (code === VIOLATION_EXIT_CODE) {
    return { kind: 'broken', reason: `exited ${String(code)} without naming a function` };
  }

  if (code === 0) {
    return { kind: 'broken', reason: 'exited 0 without finishing the analysis' };
  }

  return { kind: 'broken', reason: `exited ${String(code)}` };
}
