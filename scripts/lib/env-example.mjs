/**
 * Keeping `.env.example` honest: every variable the code reads has to be declared there, with a
 * comment saying what it does.
 *
 * A variable that only exists in someone's shell is a variable the next person discovers when
 * the process refuses to start — docs/architecture/shared/07-repository-layout.md#configuração-e-segredo.
 */

import fs from 'node:fs';
import path from 'node:path';

const DECLARATION = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/;
const DOT_ACCESS = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const BRACKET_ACCESS = /process\.env\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\]/g;
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;

/**
 * Variables declared in a `.env`-shaped file.
 *
 * @param {string} content
 * @returns {Set<string>}
 */
export function declaredVariables(content) {
  /** @type {Set<string>} */
  const names = new Set();

  for (const rawLine of content.split('\n')) {
    if (rawLine.trimStart().startsWith('#')) {
      continue;
    }

    const declaration = DECLARATION.exec(rawLine);
    if (declaration?.[1] !== undefined) {
      names.add(declaration[1]);
    }
  }

  return names;
}

/**
 * Variables a piece of source code reads from the environment.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function readVariables(content) {
  return [
    ...new Set(
      [...content.matchAll(DOT_ACCESS), ...content.matchAll(BRACKET_ACCESS)]
        .map((match) => match[1])
        .filter((name) => name !== undefined),
    ),
  ];
}

/**
 * @typedef {object} EnvRead
 * @property {string} name
 * @property {string} file repository-relative path
 */

/**
 * Every environment read under the given directories.
 *
 * @param {string} rootDir
 * @param {readonly string[]} sourceDirs repository-relative
 * @returns {EnvRead[]}
 */
export function findEnvReads(rootDir, sourceDirs) {
  /** @type {EnvRead[]} */
  const reads = [];

  /** @param {string} dir */
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          walk(full);
        }
        continue;
      }

      if (!entry.isFile() || !SOURCE_FILE.test(entry.name)) {
        continue;
      }

      const file = path.relative(rootDir, full).split(path.sep).join('/');
      for (const name of readVariables(fs.readFileSync(full, 'utf8'))) {
        reads.push({ name, file });
      }
    }
  }

  for (const sourceDir of sourceDirs) {
    const full = path.join(rootDir, sourceDir);
    if (fs.existsSync(full)) {
      walk(full);
    }
  }

  return reads;
}

/**
 * Reads the code claims to need that `.env.example` never mentions.
 *
 * @param {readonly EnvRead[]} reads
 * @param {ReadonlySet<string>} declared
 * @returns {EnvRead[]}
 */
export function undeclaredReads(reads, declared) {
  return reads.filter((read) => !declared.has(read.name));
}
