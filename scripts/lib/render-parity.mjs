/**
 * The parity of form between the web's conversation and the app's (plan 26, B-04, B-05): every
 * element the web draws in a message has its widget in the app — or a pending entry with the phase
 * that closes it, or an exclusion with the decision that excluded it
 * (docs/plans/26-mobile-conversation-parity/F1-parity-map.md).
 *
 * "The same format" is a rule only if a machine fails the divergence (rule 9 of AGENTS.md). The map
 * is `scripts/render-parity.json`, beside `i18n-shared.json`, and `pnpm render:check` reads it.
 *
 * Everything here is pure: the entry point reads the tree and hands these functions the files, the
 * texts and the state of the plan, which is what lets every rule be tested with a fake tree.
 */

/**
 * One element of the map.
 *
 * @typedef {object} ParityEntry
 * @property {string} element what the web draws — a block, a node of markdown, a label, a line
 * @property {string} web the file of the web that draws it, `path#Name` naming the part of it
 * @property {string} [label] the key of `tool-labels.ts` this entry is the label of
 * @property {string} [app] the widget of the app, `path#Name` — required when `ok`
 * @property {string} [appTest] the test of the app that draws it — required when `ok`
 * @property {string} [fixture] the recording the test draws it from, which the test has to name
 * @property {'ok' | 'pending' | 'excluded'} state
 * @property {string} [phase] the phase that closes a `pending` entry — `F2`…
 * @property {string} [decision] the decision, ✅, that excludes an `excluded` entry — `D-11`
 */

/**
 * The map as the file holds it.
 *
 * @typedef {object} ParityMap
 * @property {string[]} webRoots the folders whose every `.tsx` has to be in the map
 * @property {string[]} labelSources the files whose label keys have to be in the map
 * @property {string} labelPattern how a label key is written there, as a regular expression
 * @property {boolean} pendingAllowed whether an entry may still wait for a phase — false once the plan
 *   closed the last one (B-27)
 * @property {ParityEntry[]} entries
 */

/**
 * What the map is checked against.
 *
 * @typedef {object} ParityTree
 * @property {readonly string[]} webFiles every `.tsx` under the web roots, relative to the repository
 * @property {readonly string[]} labelKeys every label key of the label sources
 * @property {(file: string) => boolean} exists
 * @property {(file: string) => string} contentOf
 * @property {ReadonlyMap<string, string>} decisions the state of each decision of the plan, by id
 * @property {ReadonlyMap<string, string>} phases the state of each phase of the plan, by id
 */

/**
 * One reason the map fails.
 *
 * @typedef {object} ParityProblem
 * @property {'unmapped' | 'unmapped-label' | 'missing-web' | 'missing-app' | 'missing-test' | 'missing-symbol' | 'missing-fixture' | 'bad-entry' | 'stale-pending' | 'pending' | 'bad-exclusion' | 'duplicate'} kind
 * @property {string} subject what it is about — a file, an element
 * @property {string} detail
 */

const PHASE = /^F\d+$/;
const DECISION = /^D-\d+$/;

/** The file a reference names, without the part after `#`. @param {string} reference */
export function fileOf(reference) {
  const at = reference.indexOf('#');
  return at === -1 ? reference : reference.slice(0, at);
}

/** The name after `#` in a reference, or `null`. @param {string} reference */
export function symbolOf(reference) {
  const at = reference.indexOf('#');
  return at === -1 ? null : reference.slice(at + 1);
}

/**
 * Whether [content] declares [symbol]: a class, a function or a top-level value of that name.
 *
 * @param {string} content @param {string} symbol
 */
export function declares(content, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:class|enum|typedef|extension)\\s+${escaped}\\b|^[\\w<>?, ]*\\b${escaped}\\s*\\(|\\b(?:final|const)\\s+[\\w<>?, ]*\\b${escaped}\\s*=`,
    'm',
  ).test(content);
}

/**
 * The state of each decision of a `decisions.md`, by id: the last cell of its row.
 *
 * @param {string} markdown
 * @returns {Map<string, string>}
 */
export function decisionStates(markdown) {
  /** @type {Map<string, string>} */
  const states = new Map();
  for (const row of markdown.split('\n')) {
    const cells = row.split('|').map((cell) => cell.trim());
    const id = cells[1] ?? '';
    if (DECISION.test(id)) {
      states.set(id, cells.at(-2) ?? '');
    }
  }
  return states;
}

/**
 * The state of each phase of a `progress.md`, by id: the last cell of its row of the table of tasks
 * (`| [F0](F0-spike.md) | B-01…B-03 | 3/3 | ✅ |`).
 *
 * @param {string} markdown
 * @returns {Map<string, string>}
 */
export function phaseStates(markdown) {
  /** @type {Map<string, string>} */
  const states = new Map();
  for (const row of markdown.split('\n')) {
    const match = /^\|\s*\[(F\d+)\]\([^)]*\)\s*\|.*\|\s*(\S+)\s*\|\s*$/.exec(row);
    if (match !== null) {
      states.set(String(match[1]), String(match[2]));
    }
  }
  return states;
}

/**
 * Every label key [source] writes, by [pattern] — the first group of each match.
 *
 * @param {string} source @param {string} pattern
 * @returns {string[]}
 */
export function labelKeysIn(source, pattern) {
  return [...source.matchAll(new RegExp(pattern, 'g'))].map((match) => String(match[1]));
}

/** @param {ParityProblem['kind']} kind @param {string} subject @param {string} detail */
const problem = (kind, subject, detail) => ({ kind, subject, detail });

/**
 * What an `ok` entry lacks: the widget and the test it names, the widget declared in its file, and
 * the recording named by its test.
 *
 * @param {ParityEntry} entry @param {ParityTree} tree
 * @returns {ParityProblem[]}
 */
function okProblems(entry, tree) {
  if (entry.app === undefined || entry.appTest === undefined) {
    return [problem('bad-entry', entry.element, 'an `ok` entry names its widget and its test')];
  }

  const app = fileOf(entry.app);
  const symbol = symbolOf(entry.app);
  /** @type {ParityProblem[]} */
  const found = [];

  if (!tree.exists(app)) {
    found.push(problem('missing-app', entry.element, `${app} does not exist`));
  } else if (symbol !== null && !declares(tree.contentOf(app), symbol)) {
    found.push(problem('missing-symbol', entry.element, `${app} declares no ${symbol}`));
  }

  if (!tree.exists(entry.appTest)) {
    found.push(problem('missing-test', entry.element, `${entry.appTest} does not exist`));
  } else if (
    entry.fixture !== undefined &&
    !tree.contentOf(entry.appTest).includes(entry.fixture)
  ) {
    found.push(
      problem('missing-fixture', entry.element, `${entry.appTest} never names ${entry.fixture}`),
    );
  }

  return found;
}

/**
 * What a `pending` entry breaks: a phase that is not one, a phase that already closed — the promise
 * outlived the phase that made it —, or any pending at all once the map allows none.
 *
 * @param {ParityEntry} entry @param {ParityTree} tree @param {boolean} allowed
 * @returns {ParityProblem[]}
 */
function pendingProblems(entry, tree, allowed) {
  const phase = entry.phase ?? '';

  if (!PHASE.test(phase)) {
    return [
      problem('bad-entry', entry.element, 'a `pending` entry names the phase that closes it'),
    ];
  }
  if (!allowed) {
    return [
      problem('pending', entry.element, `still waits for ${phase}, and no pending is allowed`),
    ];
  }
  if (tree.phases.get(phase) === '✅') {
    return [problem('stale-pending', entry.element, `waits for ${phase}, which is already ✅`)];
  }
  return [];
}

/**
 * What an `excluded` entry breaks: no decision, one the plan does not have, or one not ✅.
 *
 * @param {ParityEntry} entry @param {ParityTree} tree
 * @returns {ParityProblem[]}
 */
function excludedProblems(entry, tree) {
  const decision = entry.decision ?? '';
  const state = tree.decisions.get(decision);

  if (!DECISION.test(decision)) {
    return [problem('bad-entry', entry.element, 'an `excluded` entry names its decision')];
  }
  if (state === undefined) {
    return [problem('bad-exclusion', entry.element, `${decision} is not a decision of the plan`)];
  }
  return state === '✅'
    ? []
    : [problem('bad-exclusion', entry.element, `${decision} is ${state}, not ✅`)];
}

/**
 * What one entry breaks, whatever its state.
 *
 * @param {ParityEntry} entry @param {ParityTree} tree @param {boolean} allowed
 * @returns {ParityProblem[]}
 */
function entryProblems(entry, tree, allowed) {
  /** @type {ParityProblem[]} */
  const found = tree.exists(fileOf(entry.web))
    ? []
    : [problem('missing-web', entry.element, `${fileOf(entry.web)} does not exist`)];

  switch (entry.state) {
    case 'ok':
      return [...found, ...okProblems(entry, tree)];
    case 'pending':
      return [...found, ...pendingProblems(entry, tree, allowed)];
    case 'excluded':
      return [...found, ...excludedProblems(entry, tree)];
    default:
      return [
        ...found,
        problem('bad-entry', entry.element, `unknown state ${String(entry.state)}`),
      ];
  }
}

/**
 * Everything the map fails, and what is still pending, by phase.
 *
 * - every `.tsx` of the web roots, and every label key of the label sources, has an entry;
 * - an `ok` entry names a widget and a test that exist, the widget declared in its file;
 * - a `pending` entry names a phase that is not ✅ yet — none at all once the map allows none;
 * - an `excluded` entry names a decision of the plan that is ✅;
 * - no element appears twice.
 *
 * @param {ParityMap} map @param {ParityTree} tree
 */
export function checkParity(map, tree) {
  const mapped = new Set(map.entries.map((entry) => fileOf(entry.web)));
  const labels = new Set(map.entries.map((entry) => entry.label).filter(Boolean));
  const seen = new Set();
  /** @type {ParityProblem[]} */
  const problems = [];

  for (const file of tree.webFiles) {
    if (!mapped.has(file)) {
      problems.push(problem('unmapped', file, 'a component of the conversation with no entry'));
    }
  }
  for (const key of new Set(tree.labelKeys)) {
    if (!labels.has(key)) {
      problems.push(problem('unmapped-label', key, 'a label of a tool with no entry'));
    }
  }
  for (const entry of map.entries) {
    if (seen.has(entry.element)) {
      problems.push(problem('duplicate', entry.element, 'the element appears twice'));
    }
    seen.add(entry.element);
    problems.push(...entryProblems(entry, tree, map.pendingAllowed));
  }

  return { problems, pending: pendingByPhase(map.entries), entries: map.entries.length };
}

/**
 * The entries still pending, by the phase that closes them, in the order of the phases.
 *
 * @param {readonly ParityEntry[]} entries
 * @returns {[string, string[]][]}
 */
export function pendingByPhase(entries) {
  /** @type {Map<string, string[]>} */
  const byPhase = new Map();
  for (const entry of entries.filter((each) => each.state === 'pending')) {
    const phase = entry.phase ?? '?';
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), entry.element]);
  }
  return [...byPhase.entries()].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
}
