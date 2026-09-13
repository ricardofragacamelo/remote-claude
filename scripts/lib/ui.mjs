/**
 * Terminal output for the scripts in `scripts/`.
 *
 * Everything a script prints goes through here. Two reasons: the output of every command looks
 * the same, and `console.*` stays forbidden across the whole repository — application logs are
 * structured (docs/architecture/shared/03-logging.md), and a CLI writes to its own stdout.
 */

const ESC = '\u001b';
const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY === true;

/**
 * @param {string} code ANSI SGR parameter
 * @param {string} text
 * @returns {string}
 */
function paint(code, text) {
  return useColor ? `${ESC}[${code}m${text}${ESC}[0m` : text;
}

/** @param {string} text */
export const bold = (text) => paint('1', text);
/** @param {string} text */
export const dim = (text) => paint('2', text);
/** @param {string} text */
export const red = (text) => paint('31', text);
/** @param {string} text */
export const green = (text) => paint('32', text);
/** @param {string} text */
export const yellow = (text) => paint('33', text);
/** @param {string} text */
export const cyan = (text) => paint('36', text);

/** @param {string} [text] */
export function line(text = '') {
  process.stdout.write(`${text}\n`);
}

/** @param {string} text */
export function title(text) {
  line();
  line(bold(text));
  line(dim('─'.repeat(text.length)));
}

/**
 * @param {string} text
 * @param {string} [detail]
 */
export function ok(text, detail) {
  line(`${green('✓')} ${text}${detail === undefined ? '' : ` ${dim(detail)}`}`);
}

/**
 * @param {string} text
 * @param {string} [detail]
 */
export function fail(text, detail) {
  line(`${red('✗')} ${text}${detail === undefined ? '' : ` ${dim(detail)}`}`);
}

/**
 * @param {string} text
 * @param {string} [detail]
 */
export function warn(text, detail) {
  line(`${yellow('!')} ${text}${detail === undefined ? '' : ` ${dim(detail)}`}`);
}

/** @param {string} text */
export function info(text) {
  line(`${cyan('·')} ${text}`);
}

/**
 * How to solve what just failed. A script that says only "failed" hands the work back to the
 * reader — see the rules for every script in docs/plans/00-bootstrap/README.md.
 *
 * @param {string} text
 */
export function hint(text) {
  line(`  ${dim('→')} ${text}`);
}

/** @param {string} text */
export function fatal(text) {
  process.stderr.write(`${red('✗')} ${text}\n`);
}
