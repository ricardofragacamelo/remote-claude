/**
 * Reading what `import_lint` reports.
 *
 * It lives apart from the script that runs the tool for one reason: `dart run import_lint`
 * prints every violation it finds and then **exits 0 regardless**, so the output is the only
 * evidence there is, and parsing it is the part that has to be tested.
 *
 * The same class of problem has already been found twice in this repository — in
 * `dependency-cruiser` and in `eslint-plugin-boundaries`. A checker that reports success without
 * checking is worse than no checker: it buys confidence it has not earned.
 */

/** One line per violation, each ending in the name of the rule it broke. */
const VIOLATION = /^\s*(?:warning|error)\s+•\s+(.+?)\s+•\s+(.+?)\s+•\s+(\S+)\s*$/;

/**
 * @typedef {object} Violation
 * @property {string} location file and position
 * @property {string} offender the import that was refused
 * @property {string} rule name of the rule
 */

/**
 * @param {string} output what the tool printed
 * @returns {Violation[]}
 */
export function parseViolations(output) {
  /** @type {Violation[]} */
  const violations = [];

  for (const raw of output.split('\n')) {
    const match = VIOLATION.exec(raw);

    if (match !== null) {
      violations.push({
        location: String(match[1]),
        offender: String(match[2]),
        rule: String(match[3]),
      });
    }
  }

  return violations;
}
