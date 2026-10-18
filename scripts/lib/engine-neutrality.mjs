/**
 * The neutrality gate (plan 28, B-04 and B-05): nothing in the core of the three ends names a coding
 * agent — not its name, its tools, its modes nor the raw fields of its input
 * (docs/architecture/shared/12-engines.md).
 *
 * "Neutral" is a rule only if a machine fails the word that breaks it (rule 9 of AGENTS.md). The
 * forbidden words live in `scripts/engine-vocabulary.json`, and the violations of the day the gate
 * was born live in `scripts/engine-neutrality-baseline.json`, each with the phase of plan 28 that
 * removes it: a ratchet that only shrinks.
 *
 * Everything here is pure: the entry point reads the tree and hands these functions the sources and
 * the state of the plan, which is what lets every rule be tested with a fake tree.
 */

/**
 * One forbidden term.
 *
 * @typedef {object} VocabularyTerm
 * @property {string} term
 * @property {'word' | 'token' | 'literal' | 'access'} match `word`: the word, in any case, in
 *   identifiers, strings and comments; `token`: the exact token, case-sensitive; `literal`: a string
 *   that is the term, or the term followed by `(`; `access`: in code, a field of the term read —
 *   `term.x`, `term?.x`, `term['x']` — for a value the core carries and never opens (plan 28, D-04)
 * @property {boolean} [prefix] with `token`: a token that starts with the term
 * @property {Token['kind'][]} [kinds] the kinds of token the term is read in — all of them when
 *   absent; for a term that is also a word of Portuguese, which comments and translations speak
 * @property {string} reason why the core never says it
 * @property {string} home where the thing it names lives instead
 */

/**
 * The vocabulary as the file holds it.
 *
 * @typedef {object} Vocabulary
 * @property {VocabularyTerm[]} terms
 * @property {{ pattern: string, reason: string }[]} exceptions names of the product, never read
 */

/**
 * One word of the vocabulary found in the core.
 *
 * @typedef {object} Violation
 * @property {string} file relative to the repository
 * @property {number} line
 * @property {string} term
 * @property {string} reason
 * @property {string} home
 */

/**
 * One line of the baseline.
 *
 * @typedef {object} BaselineEntry
 * @property {string} file
 * @property {string} term
 * @property {number} count how many times the term occurs in the file
 * @property {string} phase the phase of plan 28 that removes it — `F1`…`F7`
 */

/**
 * One reason the gate fails.
 *
 * @typedef {object} NeutralityProblem
 * @property {'new' | 'stale' | 'phase-closed' | 'bad-entry'} kind
 * @property {string} file
 * @property {string} term
 * @property {string} detail
 */

/**
 * A token of a source: what the gate reads.
 *
 * @typedef {object} Token
 * @property {'identifier' | 'string' | 'comment' | 'punct' | 'key' | 'value'} kind `key` and
 *   `value` are the strings of a JSON document, told apart by `jsonStrings`
 * @property {string} text
 * @property {number} line
 */

/** @typedef {'ts' | 'dart' | 'json'} Language */

const PHASE = /^F[1-7]$/;
const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[\w$]/;
const PUNCT = '{}[]:,';
/** After one of these, a `/` opens a regular expression, not a division. */
const BEFORE_REGEX = '(,=:[!&|?{};+-*%<>~^';

/** How many line breaks [text] holds. @param {string} text */
const breaks = (text) => text.split('\n').length - 1;

/**
 * Where a quoted string that starts at [start] ends: the index just past its closing quote, or the end
 * of the source for a string never closed.
 *
 * @param {string} source @param {number} start the index of the opening quote
 * @param {string} quote `'`, `"`, a backtick, or a triple quote of Dart
 * @param {boolean} raw whether a backslash escapes nothing — Dart's `r'…'`
 * @returns {[number, boolean]} the end, and whether the closing quote was found
 */
function stringEnd(source, start, quote, raw) {
  let i = start + quote.length;
  let depth = 0;
  while (i < source.length) {
    if (!raw && source[i] === '\\') {
      i += 2;
    } else if (quote === '`' && source.startsWith('${', i)) {
      depth += 1;
      i += 2;
    } else if (depth > 0 && source[i] === '}') {
      depth -= 1;
      i += 1;
    } else if (depth === 0 && source.startsWith(quote, i)) {
      return [i + quote.length, true];
    } else {
      i += 1;
    }
  }
  return [source.length, false];
}

/** Where a regular expression literal that starts at [start] ends. @param {string} source @param {number} start */
function regexEnd(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && source[i] !== '\n') {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '[') {
      inClass = true;
    } else if (char === ']') {
      inClass = false;
    } else if (char === '/' && !inClass) {
      return i + 1;
    }
    i += 1;
  }
  return i;
}

/** The quotes that open a string, by language. @type {Record<Language, string[]>} */
const QUOTES = { ts: ['"', "'", '`'], dart: ['"', "'"], json: ['"'] };

/**
 * The quote a string starting at [i] opens, or `null`.
 *
 * @param {string} source @param {number} i @param {Language} language
 */
function quoteAt(source, i, language) {
  const char = source[i] ?? '';
  if (!QUOTES[language].includes(char)) {
    return null;
  }
  return language === 'dart' && source.startsWith(char.repeat(3), i) ? char.repeat(3) : char;
}

/**
 * The comment that starts at [i], as `[text, end]`, or `null`.
 *
 * @param {string} source @param {number} i
 * @returns {[string, number] | null}
 */
function commentAt(source, i) {
  if (source.startsWith('//', i)) {
    const end = source.indexOf('\n', i);
    const stop = end === -1 ? source.length : end;
    return [source.slice(i + 2, stop), stop];
  }
  if (source.startsWith('/*', i)) {
    const end = source.indexOf('*/', i + 2);
    return end === -1 ? [source.slice(i + 2), source.length] : [source.slice(i + 2, end), end + 2];
  }
  return null;
}

/**
 * Where the lexer is in a source.
 *
 * @typedef {object} LexState
 * @property {string} source
 * @property {Language} language
 * @property {number} i
 * @property {number} line
 * @property {string} previous the last significant character, to tell a regex from a division
 * @property {Token[]} tokens
 */

/** @param {LexState} state */
function lexBlank(state) {
  const char = state.source[state.i] ?? '';
  if (!/\s/.test(char)) {
    return false;
  }
  state.line += char === '\n' ? 1 : 0;
  state.i += 1;
  return true;
}

/** @param {LexState} state */
function lexComment(state) {
  const comment = state.language === 'json' ? null : commentAt(state.source, state.i);
  if (comment === null) {
    return false;
  }
  state.tokens.push({ kind: 'comment', text: comment[0], line: state.line });
  state.line += breaks(comment[0]);
  state.i = comment[1];
  return true;
}

/** @param {LexState} state */
function lexString(state) {
  const { source, i, language } = state;
  const quote = quoteAt(source, i, language);
  if (quote === null) {
    return false;
  }
  const [end, closed] = stringEnd(source, i, quote, language === 'dart' && source[i - 1] === 'r');
  const text = source.slice(i + quote.length, closed ? end - quote.length : end);
  state.tokens.push({ kind: 'string', text, line: state.line });
  state.line += breaks(source.slice(i, end));
  state.previous = quote;
  state.i = end;
  return true;
}

/** @param {LexState} state */
function lexRegex(state) {
  const opens =
    state.language === 'ts' &&
    state.source[state.i] === '/' &&
    BEFORE_REGEX.includes(state.previous || '(');
  if (!opens) {
    return false;
  }
  state.i = regexEnd(state.source, state.i);
  state.previous = '/';
  return true;
}

/** @param {LexState} state */
function lexIdentifier(state) {
  const { source, i } = state;
  if (!IDENTIFIER_START.test(source[i] ?? '')) {
    return false;
  }
  let end = i + 1;
  while (end < source.length && IDENTIFIER_PART.test(source[end] ?? '')) {
    end += 1;
  }
  const text = source.slice(i, end);
  state.tokens.push({ kind: 'identifier', text, line: state.line });
  state.previous = ['return', 'typeof', 'case', 'in', 'of'].includes(text) ? '(' : 'a';
  state.i = end;
  return true;
}

/** Any other character: punctuation for JSON, an operator or a number otherwise. @param {LexState} state */
function lexOther(state) {
  const char = state.source[state.i] ?? '';
  if (PUNCT.includes(char)) {
    state.tokens.push({ kind: 'punct', text: char, line: state.line });
  }
  state.previous = char;
  state.i += 1;
  return true;
}

const LEXERS = [lexBlank, lexComment, lexString, lexRegex, lexIdentifier, lexOther];

/**
 * The tokens of a source: identifiers, strings, comments and, for JSON, the punctuation that gives
 * a string its place. Numbers and operators are not the subject of the gate.
 *
 * @param {string} source @param {Language} language
 * @returns {Token[]}
 */
export function lex(source, language) {
  /** @type {LexState} */
  const state = { source, language, i: 0, line: 1, previous: '', tokens: [] };
  while (state.i < source.length) {
    LEXERS.some((lexer) => lexer(state));
  }
  return state.tokens;
}

/**
 * The words of a text, in lower case: split at every character that is not a letter or a digit,
 * and each piece split at its camel humps — `claudeSessionId` is `claude`, `session`, `id`.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function wordsOf(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/**
 * [text] with every name of the product blanked out: the product is not the engine.
 *
 * @param {string} text @param {readonly { pattern: string }[]} exceptions
 */
export function withoutExceptions(text, exceptions) {
  return exceptions.reduce(
    (current, exception) => current.replace(new RegExp(exception.pattern, 'g'), ' '),
    text,
  );
}

/**
 * How many times [term] occurs in one token.
 *
 * @param {Token} token @param {VocabularyTerm} term
 */
export function hitsIn(token, term) {
  if (term.kinds !== undefined && !term.kinds.includes(token.kind)) {
    return 0;
  }
  switch (term.match) {
    case 'word':
      return wordsOf(token.text).filter((word) => word === term.term.toLowerCase()).length;
    case 'token':
      return token.text
        .split(/[^\w]+/)
        .filter((piece) =>
          term.prefix === true ? piece.startsWith(term.term) : piece === term.term,
        ).length;
    case 'literal':
      return ['string', 'key', 'value'].includes(token.kind) &&
        (token.text === term.term || token.text.startsWith(`${term.term}(`))
        ? 1
        : 0;
    default:
      return 0;
  }
}

/**
 * Every violation in a list of tokens.
 *
 * @param {string} file @param {readonly Token[]} tokens @param {Vocabulary} vocabulary
 * @returns {Violation[]}
 */
export function violationsIn(file, tokens, vocabulary) {
  /** @type {Violation[]} */
  const found = [];
  for (const token of tokens.filter((each) => each.kind !== 'punct')) {
    // Line by line, so a term in the fifth line of a comment is reported on that line.
    for (const [offset, text] of token.text.split('\n').entries()) {
      const piece = { ...token, text: withoutExceptions(text, vocabulary.exceptions) };
      const whole = { ...token, text: withoutExceptions(token.text, vocabulary.exceptions) };
      for (const term of vocabulary.terms) {
        // A literal is the whole string; it is read once, on the line the string opens.
        const hits =
          term.match === 'literal' ? (offset === 0 ? hitsIn(whole, term) : 0) : hitsIn(piece, term);
        for (let each = 0; each < hits; each += 1) {
          found.push({
            file,
            line: token.line + offset,
            term: term.term,
            reason: term.reason,
            home: term.home,
          });
        }
      }
    }
  }
  return found;
}

/**
 * A string of a JSON document, with its path of keys and whether it is a key or a value.
 *
 * @typedef {{ token: Token, path: string[], role: 'key' | 'value' }} JsonString
 */

/**
 * Where the walk over a JSON document is.
 *
 * @typedef {object} JsonWalk
 * @property {JsonString[]} strings
 * @property {{ array: boolean, key: string | null }[]} stack the open objects and arrays, each with
 *   the key it is the value of
 * @property {string | null} pending the key whose value comes next
 */

/** @param {JsonWalk} walk @param {Token} token @param {boolean} beforeColon */
function walkString(walk, token, beforeColon) {
  const keys = walk.stack.map((frame) => frame.key ?? '').filter(Boolean);
  if (beforeColon && walk.stack.at(-1)?.array === false) {
    walk.pending = token.text;
    walk.strings.push({ token, path: [...keys, token.text], role: 'key' });
    return;
  }
  walk.strings.push({ token, path: [...keys, walk.pending ?? ''].filter(Boolean), role: 'value' });
}

/** @param {JsonWalk} walk @param {string} punct */
function walkPunct(walk, punct) {
  if (punct === '{' || punct === '[') {
    walk.stack.push({ array: punct === '[', key: walk.pending });
    walk.pending = null;
  } else if (punct === '}' || punct === ']') {
    walk.stack.pop();
    walk.pending = null;
  } else if (punct === ',' && walk.stack.at(-1)?.array === false) {
    walk.pending = null;
  }
}

/**
 * The strings of a JSON document, each with its path of keys and whether it is a key or a value.
 *
 * @param {readonly Token[]} tokens the tokens of the document, as `lex(…, 'json')` gives them
 * @returns {JsonString[]}
 */
export function jsonStrings(tokens) {
  /** @type {JsonWalk} */
  const walk = { strings: [], stack: [], pending: null };
  for (const [index, token] of tokens.entries()) {
    if (token.kind === 'string') {
      walkString(walk, token, tokens[index + 1]?.text === ':');
    } else {
      walkPunct(walk, token.text);
    }
  }
  return walk.strings;
}

/**
 * What one file of the tree is to the gate, or `null` when the gate does not read it.
 *
 * - the code of the core: `backend/src`, `web/src` and `mobile/lib`, out of any `engines/` folder,
 *   with generated code left out;
 * - the strings of i18n of the three ends, out of the `engines` namespaces;
 * - every schema of the contract.
 *
 * @param {string} file relative to the repository, with `/`
 * @returns {{ kind: 'code' | 'i18n' | 'schema', language: Language } | null}
 */
export function scopeOf(file) {
  const segments = file.split('/');
  if (segments.includes('engines') || segments.includes('generated')) {
    return null;
  }
  if (/^(web|backend)\/src\/shared\/i18n\/locales\/[^/]+\.json$/.test(file)) {
    return { kind: 'i18n', language: 'json' };
  }
  if (/^mobile\/lib\/l10n\/[^/]+\.arb$/.test(file)) {
    return { kind: 'i18n', language: 'json' };
  }
  if (/^packages\/contracts\/schema\/.+\.json$/.test(file)) {
    return { kind: 'schema', language: 'json' };
  }
  if (/\.(g|freezed)\.dart$/.test(file) || /(^|\/)protocol\.ts$/.test(file)) {
    return null;
  }
  if (/^(backend\/src|web\/src)\/.+\.tsx?$/.test(file)) {
    return { kind: 'code', language: 'ts' };
  }
  if (/^mobile\/lib\/.+\.dart$/.test(file)) {
    return { kind: 'code', language: 'dart' };
  }
  return null;
}

/**
 * Whether a string of a JSON document is out of the gate: in i18n, a key of an extension's
 * namespace and its value; in a schema, an example, or a value under `native`, which is opaque.
 *
 * @param {'i18n' | 'schema'} kind @param {string[]} path @param {'key' | 'value'} role
 */
function outOfReach(kind, path, role) {
  if (kind === 'i18n') {
    return (path[0] ?? '').replace(/^@/, '').startsWith('engines');
  }
  return path.includes('examples') || (role === 'value' && path.includes('native'));
}

/**
 * Every violation in one file of the tree.
 *
 * @param {string} file relative to the repository
 * @param {string} source @param {Vocabulary} vocabulary
 * @returns {Violation[]}
 */
export function scanFile(file, source, vocabulary) {
  const scope = scopeOf(file);
  if (scope === null) {
    return [];
  }
  const tokens = lex(source, scope.language);
  if (scope.kind === 'code') {
    return [...violationsIn(file, tokens, vocabulary), ...accessesIn(file, source, vocabulary)];
  }
  const kind = scope.kind;
  const read = jsonStrings(tokens)
    .filter((each) => !outOfReach(kind, each.path, each.role))
    .map((each) => ({ ...each.token, kind: each.role }));
  return violationsIn(file, read, vocabulary);
}

/** A line that is a comment, or the inside of one: what an `access` term is not read in. */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

/**
 * Every field read of an `access` term in code: the term followed by `.`, `?.`, `!.` or `[`. Read on
 * the source, because the lexer keeps no operators; a line that is a comment is left out.
 *
 * @param {string} file @param {string} source @param {Vocabulary} vocabulary
 * @returns {Violation[]}
 */
export function accessesIn(file, source, vocabulary) {
  /** @type {Violation[]} */
  const found = [];
  const terms = vocabulary.terms.filter((term) => term.match === 'access');
  for (const [index, text] of source.split('\n').entries()) {
    if (COMMENT_LINE.test(text)) {
      continue;
    }
    for (const term of terms) {
      const reads = text.match(new RegExp(`\\b${term.term}\\s*[?!]?\\s*(\\.|\\[)`, 'g')) ?? [];
      found.push(
        ...reads.map(() => ({
          file,
          line: index + 1,
          term: term.term,
          reason: term.reason,
          home: term.home,
        })),
      );
    }
  }
  return found;
}

/** The key of a file and a term. @param {string} file @param {string} term */
const keyOf = (file, term) => `${file}\u0000${term}`;

/**
 * The violations by file and term, each with the lines it was found on.
 *
 * @param {readonly Violation[]} violations
 * @returns {Map<string, { file: string, term: string, lines: number[] }>}
 */
export function grouped(violations) {
  /** @type {Map<string, { file: string, term: string, lines: number[] }>} */
  const groups = new Map();
  for (const each of violations) {
    const key = keyOf(each.file, each.term);
    const group = groups.get(key) ?? { file: each.file, term: each.term, lines: [] };
    group.lines.push(each.line);
    groups.set(key, group);
  }
  return groups;
}

/** @param {NeutralityProblem['kind']} kind @param {string} file @param {string} term @param {string} detail */
const problem = (kind, file, term, detail) => ({ kind, file, term, detail });

/**
 * What one entry of the baseline breaks by itself: a phase that is not one of the plan, or one that
 * already closed — a violation that outlived the phase that promised to remove it.
 *
 * @param {BaselineEntry} entry @param {ReadonlyMap<string, string>} phases
 * @returns {NeutralityProblem[]}
 */
function entryProblems(entry, phases) {
  if (!PHASE.test(entry.phase)) {
    return [problem('bad-entry', entry.file, entry.term, `phase ${entry.phase} is not F1…F7`)];
  }
  if (phases.get(entry.phase) === '✅') {
    return [
      problem('phase-closed', entry.file, entry.term, `${entry.phase} is ✅, and it still occurs`),
    ];
  }
  return [];
}

/**
 * Everything the gate fails, against the baseline:
 *
 * - a violation the baseline does not hold, or more of them than it holds — the core coupled again;
 * - an entry that occurs fewer times than it says, or not at all — the baseline follows the code
 *   down, never stays above it;
 * - an entry whose phase is ✅ in the plan, or is not a phase;
 * - the same file and term twice.
 *
 * @param {readonly Violation[]} violations
 * @param {readonly BaselineEntry[]} baseline
 * @param {ReadonlyMap<string, string>} phases the state of each phase of plan 28, by id
 * @returns {NeutralityProblem[]}
 */
export function checkBaseline(violations, baseline, phases) {
  const groups = grouped(violations);
  /** @type {Map<string, BaselineEntry>} */
  const entries = new Map();
  /** @type {NeutralityProblem[]} */
  const problems = [];

  for (const entry of baseline) {
    const key = keyOf(entry.file, entry.term);
    if (entries.has(key)) {
      problems.push(problem('bad-entry', entry.file, entry.term, 'the entry appears twice'));
    }
    entries.set(key, entry);
    problems.push(...entryProblems(entry, phases));
  }

  for (const [key, group] of groups) {
    const allowed = entries.get(key)?.count ?? 0;
    const lines = group.lines.join(', ');
    if (group.lines.length > allowed) {
      problems.push(
        problem(
          'new',
          group.file,
          group.term,
          `${String(group.lines.length)} found (lines ${lines}), the baseline allows ${String(allowed)}`,
        ),
      );
    } else if (group.lines.length < allowed) {
      problems.push(
        problem(
          'stale',
          group.file,
          group.term,
          `${String(group.lines.length)} found, the baseline still says ${String(allowed)}`,
        ),
      );
    }
  }

  for (const [key, entry] of entries) {
    if (!groups.has(key)) {
      problems.push(problem('stale', entry.file, entry.term, 'no longer occurs'));
    }
  }

  return problems;
}

/**
 * How many entries and occurrences each phase still has to remove, in the order of the phases.
 *
 * @param {readonly BaselineEntry[]} baseline
 * @returns {[string, { entries: number, occurrences: number }][]}
 */
export function remainingByPhase(baseline) {
  /** @type {Map<string, { entries: number, occurrences: number }>} */
  const byPhase = new Map();
  for (const entry of baseline) {
    const now = byPhase.get(entry.phase) ?? { entries: 0, occurrences: 0 };
    byPhase.set(entry.phase, {
      entries: now.entries + 1,
      occurrences: now.occurrences + entry.count,
    });
  }
  return [...byPhase.entries()].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
}
