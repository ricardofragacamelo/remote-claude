/**
 * The translation catalogues, compared.
 *
 * Three failures this catches, and each one ships silently otherwise: a key added to `en` and
 * forgotten in `pt-BR`, a key nobody uses any more, and a placeholder that exists in one
 * language and not in the other. The last is the nastiest — the sentence renders, with a hole
 * where the value should have been.
 *
 * See docs/architecture/shared/02-i18n.md.
 */

/**
 * Flattens a nested catalogue into dotted keys.
 *
 * @param {unknown} value
 * @param {string} [prefix]
 * @returns {Map<string, string>}
 */
export function flatten(value, prefix = '') {
  /** @type {Map<string, string>} */
  const flat = new Map();

  if (typeof value !== 'object' || value === null) {
    return flat;
  }

  for (const [key, entry] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    if (typeof entry === 'string') {
      flat.set(path, entry);
      continue;
    }

    for (const [nested, text] of flatten(entry, path)) {
      flat.set(nested, text);
    }
  }

  return flat;
}

/**
 * Reads an ARB catalogue as flat keys, dropping the `@`-prefixed metadata entries.
 *
 * @param {Record<string, unknown>} catalogue
 * @returns {Map<string, string>}
 */
export function fromArb(catalogue) {
  /** @type {Map<string, string>} */
  const flat = new Map();

  for (const [key, value] of Object.entries(catalogue)) {
    if (!key.startsWith('@') && typeof value === 'string') {
      flat.set(key, value);
    }
  }

  return flat;
}

/**
 * The placeholders a translation interpolates.
 *
 * Named, never positional: word order changes between languages, and a positional placeholder
 * cannot survive that.
 *
 * @param {string} text
 * @param {RegExp} pattern with one capture group for the name, and the `g` flag
 * @returns {Set<string>}
 */
export function paramsOf(text, pattern) {
  /** @type {Set<string>} */
  const params = new Set();

  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined) {
      params.add(name.trim());
    }
  }

  return params;
}

/** `{{path}}`, the i18next form used on the web. */
export const MUSTACHE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** `{path}`, the ICU form used by ARB. */
export const BRACE = /\{\s*([A-Za-z0-9_]+)\s*\}/g;

/**
 * @typedef {object} Catalogue
 * @property {string} locale
 * @property {Map<string, string>} entries
 */

/**
 * @typedef {object} Problem
 * @property {'missing' | 'extra' | 'params' | 'orphan'} kind
 * @property {string} key
 * @property {string} detail
 */

/**
 * Compares a set of catalogues against the first one, which is the source of truth.
 *
 * @param {readonly Catalogue[]} catalogues `en` first
 * @param {RegExp} pattern placeholder syntax of this catalogue family
 * @returns {Problem[]}
 */
export function compareCatalogues(catalogues, pattern) {
  const [source, ...others] = catalogues;

  if (source === undefined) {
    return [];
  }

  /** @type {Problem[]} */
  const problems = [];

  for (const other of others) {
    for (const [key, text] of source.entries) {
      const translated = other.entries.get(key);

      if (translated === undefined) {
        problems.push({ kind: 'missing', key, detail: `absent from ${other.locale}` });
        continue;
      }

      const expected = [...paramsOf(text, pattern)].sort();
      const actual = [...paramsOf(translated, pattern)].sort();

      if (expected.join(',') !== actual.join(',')) {
        problems.push({
          kind: 'params',
          key,
          detail:
            `${source.locale} interpolates [${expected.join(', ')}], ` +
            `${other.locale} interpolates [${actual.join(', ')}]`,
        });
      }
    }

    for (const key of other.entries.keys()) {
      if (!source.entries.has(key)) {
        problems.push({ kind: 'extra', key, detail: `only in ${other.locale}` });
      }
    }
  }

  return problems;
}

/**
 * @typedef {object} Usage
 * @property {Set<string>} keys keys named in full
 * @property {Set<string>} prefixes prefixes of keys built at runtime, such as `connection.status.`
 */

/**
 * Keys nobody uses.
 *
 * A key reached through an interpolated name — `t(`connection.status.${status}`)` — is counted
 * as used for its whole prefix. Without that the check would report a screen's every state as
 * an orphan, which is the sort of noise that gets a gate turned off.
 *
 * @param {Iterable<string>} declared
 * @param {Usage} usage
 * @returns {Problem[]}
 */
export function findOrphans(declared, usage) {
  /** @type {Problem[]} */
  const problems = [];

  for (const key of declared) {
    if (usage.keys.has(key)) {
      continue;
    }

    if ([...usage.prefixes].some((prefix) => key.startsWith(prefix))) {
      continue;
    }

    problems.push({ kind: 'orphan', key, detail: 'declared, never used' });
  }

  return problems;
}

/** `t('a.b.c')` and `t("a.b.c")`, the static form. */
const STATIC_KEY = /\bt\(\s*['"]([A-Za-z0-9_.]+)['"]/g;

/** ``t(`a.b.${x}`)``, the interpolated form — it covers the whole prefix. */
const DYNAMIC_KEY = /\bt\(\s*`([A-Za-z0-9_.]*?)\$\{/g;

/**
 * What a TypeScript source names.
 *
 * @param {string} source
 * @returns {Usage}
 */
export function usageInTypeScript(source) {
  return {
    keys: new Set([...source.matchAll(STATIC_KEY)].map((match) => String(match[1]))),
    prefixes: new Set([...source.matchAll(DYNAMIC_KEY)].map((match) => String(match[1]))),
  };
}

/** `l10n.someKey` and `AppLocalizations.of(context).someKey` — the two ways a screen reads one. */
const DART_KEY = /(?:\bl10n|AppLocalizations\.of\([^)]*\))\.([A-Za-z0-9_]+)\b/g;

/**
 * What a Dart source names.
 *
 * There is no interpolated form here: ARB generates getters, so a key built at runtime would
 * not compile. That is the point of ARB over a lookup by string.
 *
 * @param {string} source
 * @returns {Usage}
 */
export function usageInDart(source) {
  return {
    keys: new Set([...source.matchAll(DART_KEY)].map((match) => String(match[1]))),
    prefixes: new Set(),
  };
}

/**
 * Merges what several sources name.
 *
 * @param {readonly Usage[]} usages
 * @returns {Usage}
 */
export function mergeUsage(usages) {
  return {
    keys: new Set(usages.flatMap((usage) => [...usage.keys])),
    prefixes: new Set(usages.flatMap((usage) => [...usage.prefixes])),
  };
}

/** A dotted, lower-camel key as it appears quoted in source. */
const LITERAL_KEY = /['"]([a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*){2,})['"]/g;

/**
 * Keys a module names as plain strings.
 *
 * The backend sends `messageKey` and the client translates whatever arrives, so a key the
 * backend can emit is a key the catalogue has to carry — and it is used, even though no `t()`
 * call in the front end mentions it by name.
 *
 * @param {string} source
 * @returns {Usage}
 */
export function usageInLiterals(source) {
  return {
    keys: new Set([...source.matchAll(LITERAL_KEY)].map((match) => String(match[1]))),
    prefixes: new Set(),
  };
}
