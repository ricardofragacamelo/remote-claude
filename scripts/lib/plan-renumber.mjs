/**
 * Making room for a plan in the middle of the sequence.
 *
 * Plans are numbered by dependency, so a plan that has to come right after another one takes
 * that position, and every plan from there on moves up by one: its directory, and every place
 * that names it. Done by hand, that is a hundred files of search and replace, and the reference
 * forgotten in the hundred-and-first is a link that `docs:check` finds weeks later — or a
 * "see plan 12" that now points at the wrong plan and nobody notices.
 *
 * Only the **explicit** forms are rewritten: a plan directory (`12-claude-settings`), a plan
 * named as one (`plano 12`, `plans 06 to 17`), a cross reference (`12 · D-15`), a link titled
 * with its number (`[12 — Configuração do Claude]`) and the number cell of the index. A bare
 * number (`o 18 empacota`) is ambiguous — "11 portões" is a count, not a plan — so it is
 * reported for a person to read, never rewritten.
 */

/**
 * @typedef {object} Shift
 * @property {number} from the first plan number that moves up by one
 * @property {readonly string[]} slugs the slugs of the plans that move, without their number
 */

/**
 * @typedef {object} Suspect
 * @property {number} line 1-based
 * @property {string} text the line, trimmed
 */

const SEPARATOR = String.raw`(?:\s*(?:,|…|–|-)\s*|\s+(?:a|e|and|to|ou|or)\s+)`;
const TWO_DIGITS = String.raw`(?<!\d)\d{2}(?!\d)`;
const NUMBER_LIST = String.raw`\**${TWO_DIGITS}\**(?:${SEPARATOR}\**${TWO_DIGITS}\**)*`;

/** `plano 12`, `Planos **06 a 17**`, `plans 10, 11 and 12`. */
const NAMED_PLANS = new RegExp(String.raw`\b([Pp]lan(?:os?|s)?)(\s+)(${NUMBER_LIST})`, 'gu');

/** `12 · D-15`, `(18 · B-04)`, `08 · F6`. */
const CROSS_REFERENCE = /(?<!\d)(\d{2})(\s·\s)(?=[BDSR]-\d|F\d)/gu;

/**
 * A plan named in a link fragment — the slug of a heading that names it, which the heading's own
 * rewrite would leave pointing at nothing: `#d-15--a-fronteira-com-os-planos-07-11-e-12`.
 */
const NAMED_PLANS_IN_ANCHOR =
  /(#[^\s)\]]*?\bplan(?:os?|s)?-)(\d{2}(?:-(?:(?:a|e|and|to|ou|or)-)?\d{2})*)(?!\d)/gu;

/** `[12](../12-claude-settings/README.md)` — a link whose whole text is the number of the plan it opens. */
const NUMBER_LINK = /\[(\d{2})\](?=\((?:\.\.\/)*\d{2}-[a-z0-9])/gu;

/** `[12 — Configuração do Claude](…)`. */
const NUMBERED_LINK = /\[(\d{2})(\s—\s)/gu;

/** The number cell of a row of the plan index: `| 12 | [Configuração do Claude](12-claude-settings/…)`. */
const INDEX_ROW = /^\|\s(\d{2})(\s\|\s\[[^\]]*\]\(\d{2}-)/u;

/** A bare plan number after a word that usually introduces one. Reported, not rewritten. */
const BARE_NUMBER =
  /\b(?:o|do|no|ao|pelo|os|dos|nos|até|the)\s(\d{2})\b(?!\s*(?:%|º|ª|px|ms|s\b|h\b))/u;

/** Words of a sentence that tells the story of an earlier renumbering. */
const RENUMBERING_STORY = /renumer|passaram a|viraram|became|renumber/iu;

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * @param {number} number
 * @param {Shift} shift
 * @returns {number}
 */
export function shiftedNumber(number, shift) {
  return number >= shift.from ? number + 1 : number;
}

/**
 * @param {string} digits two digits
 * @param {Shift} shift
 * @returns {string}
 */
function shiftDigits(digits, shift) {
  return String(shiftedNumber(Number(digits), shift)).padStart(2, '0');
}

/**
 * Every explicit reference to a plan that moves, rewritten to its new number.
 *
 * Each number is mapped once, from the original text: plan 12 becomes 13 and the old 13 becomes
 * 14 in the same pass, never 12 → 13 → 14.
 *
 * @param {string} content
 * @param {Shift} shift
 * @returns {string}
 */
export function shiftReferences(content, shift) {
  const slugs = shift.slugs.map(escapeRegExp).join('|');
  const directories =
    slugs === '' ? null : new RegExp(String.raw`(?<![\w-])(\d{2})-(${slugs})(?![\w-])`, 'gu');

  const shifted = content
    .split('\n')
    .map((text) =>
      text.replace(INDEX_ROW, (_, digits, rest) => `| ${shiftDigits(digits, shift)}${rest}`),
    )
    .join('\n')
    .replaceAll(NAMED_PLANS, (_, word, space, list) => {
      const numbers = list.replaceAll(/(?<!\d)\d{2}(?!\d)/gu, (/** @type {string} */ digits) =>
        shiftDigits(digits, shift),
      );
      return `${word}${space}${numbers}`;
    })
    .replaceAll(NAMED_PLANS_IN_ANCHOR, (_, prefix, list) => {
      const numbers = list.replaceAll(/(?<!\d)\d{2}(?!\d)/gu, (/** @type {string} */ digits) =>
        shiftDigits(digits, shift),
      );
      return `${prefix}${numbers}`;
    })
    .replaceAll(CROSS_REFERENCE, (_, digits, dot) => `${shiftDigits(digits, shift)}${dot}`)
    .replaceAll(NUMBER_LINK, (_, digits) => `[${shiftDigits(digits, shift)}]`)
    .replaceAll(NUMBERED_LINK, (_, digits, dash) => `[${shiftDigits(digits, shift)}${dash}`);

  return directories === null
    ? shifted
    : shifted.replaceAll(directories, (_, digits, slug) => `${shiftDigits(digits, shift)}-${slug}`);
}

/**
 * The lines a person has to read after the rewrite.
 *
 * Two kinds: a bare number that may be a plan the rewrite could not tell apart from a count, and
 * a changed line that tells the story of an earlier renumbering — "os planos 09…18 passaram a
 * 10…19" is history, and rewriting half of it makes it false.
 *
 * @param {string} before
 * @param {string} after
 * @param {Shift} shift
 * @returns {Suspect[]}
 */
export function suspectLines(before, after, shift) {
  const original = before.split('\n');

  return after.split('\n').flatMap((text, index) => {
    const bare = BARE_NUMBER.exec(text);
    const isBarePlan = bare !== null && Number(bare[1]) >= shift.from;
    const isStory = text !== original[index] && RENUMBERING_STORY.test(text);

    return isBarePlan || isStory ? [{ line: index + 1, text: text.trim() }] : [];
  });
}

/**
 * The directory renames, highest first, so no rename lands on a directory that has not moved yet.
 *
 * @param {ReadonlyArray<{ name: string, number: number }>} plans
 * @param {number} from
 * @returns {Array<{ from: string, to: string }>}
 */
export function directoryMoves(plans, from) {
  return plans
    .filter((plan) => plan.number >= from)
    .sort((left, right) => right.number - left.number)
    .map((plan) => ({
      from: plan.name,
      to: `${String(plan.number + 1).padStart(2, '0')}${plan.name.slice(2)}`,
    }));
}
