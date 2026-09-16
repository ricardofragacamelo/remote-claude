#!/usr/bin/env node
/**
 * Key parity, orphan keys and placeholder parity, across every catalogue of the product.
 *
 * `en` is the source of truth in both families: a key that does not exist there does not exist.
 * See docs/architecture/shared/02-i18n.md.
 *
 * Usage: `pnpm i18n:check`
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { filesUnder } from './lib/files.mjs';

import {
  BRACE,
  MUSTACHE,
  compareCatalogues,
  findOrphans,
  flatten,
  fromArb,
  mergeUsage,
  usageInDart,
  usageInLiterals,
  usageInTypeScript,
} from './lib/i18n.mjs';
import { repoRoot } from './lib/paths.mjs';
import { bold, dim, fail, hint, line, ok, title } from './lib/ui.mjs';

/**
 * @typedef {object} Family
 * @property {string} name what to call it in the output
 * @property {string} sourceDir where the code that uses the keys lives
 * @property {readonly string[]} sourceExtensions
 * @property {RegExp} placeholders
 * @property {(source: string) => import('./lib/i18n.mjs').Usage} readUsage
 * @property {readonly { locale: string, file: string, arb?: boolean }[]} catalogues
 * @property {readonly { dir: string, extensions: readonly string[] }[]} [emitters] modules that
 *   name a key as a plain string rather than translating it
 */

/** The two catalogue families of the product. The mobile one is ARB; the web one is JSON. */
export const FAMILIES = [
  {
    name: 'web',
    sourceDir: 'web/src',
    sourceExtensions: ['.ts', '.tsx'],
    placeholders: MUSTACHE,
    // A component names a key in `t('a.b')`; a service names one when it builds an `AppError`.
    // Both are uses, and only reading both keeps the orphan check honest.
    readUsage: (/** @type {string} */ source) =>
      mergeUsage([usageInTypeScript(source), usageInLiterals(source)]),
    catalogues: [
      { locale: 'en', file: 'web/src/shared/i18n/locales/en.json' },
      { locale: 'pt-BR', file: 'web/src/shared/i18n/locales/pt-BR.json' },
    ],
    // The backend never sends prose: it sends a `messageKey`, and the client translates
    // whatever arrives. A key the catalogue of errors can emit is therefore in use, even
    // though no `t()` call in the front end spells it out.
    emitters: [{ dir: 'backend/src', extensions: ['.ts'] }],
  },
  {
    name: 'mobile',
    sourceDir: 'mobile/lib',
    sourceExtensions: ['.dart'],
    placeholders: BRACE,
    readUsage: usageInDart,
    catalogues: [
      { locale: 'en', file: 'mobile/lib/l10n/app_en.arb', arb: true },
      { locale: 'pt', file: 'mobile/lib/l10n/app_pt.arb', arb: true },
    ],
  },
];

/**
 * Generated catalogues name every key of the catalogue they were generated from, so counting
 * them as usage would make the orphan check answer "everything is used", always.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isGenerated(name) {
  return name === 'generated';
}

/**
 * Checks one family.
 *
 * @param {Family} family
 * @returns {import('./lib/i18n.mjs').Problem[]}
 */
export function checkFamily(family) {
  const catalogues = family.catalogues.map((catalogue) => {
    const parsed = /** @type {Record<string, unknown>} */ (
      JSON.parse(fs.readFileSync(path.join(repoRoot, catalogue.file), 'utf8'))
    );

    return {
      locale: catalogue.locale,
      entries: catalogue.arb === true ? fromArb(parsed) : flatten(parsed),
    };
  });

  const usage = mergeUsage([
    ...filesUnder(path.join(repoRoot, family.sourceDir), family.sourceExtensions, isGenerated).map(
      (file) => family.readUsage(fs.readFileSync(file, 'utf8')),
    ),
    ...(family.emitters ?? []).flatMap((emitter) =>
      filesUnder(path.join(repoRoot, emitter.dir), emitter.extensions, isGenerated).map((file) =>
        usageInLiterals(fs.readFileSync(file, 'utf8')),
      ),
    ),
  ]);

  const source = catalogues[0];

  return [
    ...compareCatalogues(catalogues, family.placeholders),
    ...(source === undefined ? [] : findOrphans(source.entries.keys(), usage)),
  ];
}

title('i18n — key parity, orphans and placeholders');

let failures = 0;

for (const family of FAMILIES) {
  const problems = checkFamily(/** @type {Family} */ (family));

  for (const problem of problems) {
    fail(`${family.name} · ${problem.key}`, problem.detail);
  }

  if (problems.length === 0) {
    ok(family.name, dim('every key is in both languages, used, and interpolates the same'));
  }

  failures += problems.length;
}

line();

if (failures > 0) {
  fail(bold(`${String(failures)} problem(s)`), 'no string reaches a user hardcoded');
  hint('add the missing key, delete the unused one, or fix the placeholder — never both halves');
  hint('docs/architecture/shared/02-i18n.md');
  process.exit(1);
}

ok(bold('every catalogue agrees'));
