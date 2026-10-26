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

/**
 * Variables a Compose file interpolates.
 *
 * `docker-compose.yml` reads the environment just like the code does, and a variable that only
 * the compose file knows about is exactly the kind that goes undocumented — no `process.env`
 * anywhere for the scan above to find. Matches `${NAME}`, `${NAME:-default}` and `${NAME-x}`.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function interpolatedVariables(content) {
  const INTERPOLATION = /\$\{([A-Z][A-Z0-9_]*)(?::?[-+?][^}]*)?\}/g;

  return [
    ...new Set(
      [...content.matchAll(INTERPOLATION)].map((match) => match[1]).filter((n) => n !== undefined),
    ),
  ];
}

/**
 * @typedef {object} EnvVariable
 * @property {string} name
 * @property {string} value the default shown in `.env.example`
 * @property {string} description the comment directly above it, joined into one line
 */

/**
 * @typedef {object} EnvSection
 * @property {string} title
 * @property {string[]} intro paragraphs that precede the first variable of the section
 * @property {EnvVariable[]} variables
 */

const SECTION_HEADING = /^#\s*-{2,}\s*(.+?)\s*-{2,}\s*$/;
const VARIABLE_DECLARATION = /^([A-Z][A-Z0-9_]*)=(.*)$/;

/** @param {string} line */
function uncommented(line) {
  return line.replace(/^#\s?/, '').trim();
}

/**
 * Breaks `.env.example` into the sections its `# --- Title ---` headings mark, each with the
 * variables it declares and the comment above each one. A comment block followed by a blank line
 * before any variable is the section's own prose, not a variable's description — exactly how a
 * person reads the file.
 *
 * @param {string} content
 * @returns {EnvSection[]}
 */
export function parseEnvExample(content) {
  /** @type {EnvSection[]} */
  const sections = [];
  /** @type {EnvSection | null} */
  let current = null;
  /** @type {string[]} */
  let pending = [];

  function flushAsIntro() {
    const text = pending.map(uncommented).filter((line) => line !== '').join(' ');
    if (current !== null && text !== '') {
      current.intro.push(text);
    }
    pending = [];
  }

  for (const rawLine of content.split('\n')) {
    const heading = SECTION_HEADING.exec(rawLine);
    if (heading?.[1] !== undefined) {
      pending = [];
      current = { title: heading[1], intro: [], variables: [] };
      sections.push(current);
      continue;
    }

    if (current === null) {
      continue;
    }

    const trimmed = rawLine.trim();
    if (trimmed === '') {
      flushAsIntro();
      continue;
    }

    if (trimmed.startsWith('#')) {
      pending.push(trimmed);
      continue;
    }

    const declaration = VARIABLE_DECLARATION.exec(trimmed);
    if (declaration?.[1] !== undefined) {
      current.variables.push({
        name: declaration[1],
        value: declaration[2] ?? '',
        description: pending.map(uncommented).filter((line) => line !== '').join(' '),
      });
      pending = [];
    }
  }

  return sections;
}

/** @param {string} cell */
function tableCell(cell) {
  return cell.replace(/\|/g, '\\|');
}

/**
 * The human-readable catalogue of every variable `.env.example` declares, grouped the same way
 * the file groups them. This is generated, never edited by hand — `scripts/env-docs.mjs` writes
 * it, and a test keeps it from drifting the moment someone edits `.env.example` and forgets.
 *
 * @param {string} content of `.env.example`
 * @returns {string}
 */
export function renderEnvironmentDoc(content) {
  const lines = [
    '# Environment variables',
    '',
    'Generated from [`.env.example`](../../../.env.example) by `pnpm env:docs` — edit the comments',
    'there and regenerate; do not edit this file by hand. `pnpm test:unit` (root) fails when the two',
    'are out of sync.',
    '',
  ];

  for (const section of parseEnvExample(content)) {
    lines.push(`## ${section.title}`, '');

    for (const paragraph of section.intro) {
      lines.push(paragraph, '');
    }

    if (section.variables.length > 0) {
      lines.push('| Variable | Default | Description |', '|---|---|---|');
      for (const variable of section.variables) {
        const value = variable.value === '' ? '*(empty)*' : `\`${tableCell(variable.value)}\``;
        lines.push(`| \`${variable.name}\` | ${value} | ${tableCell(variable.description)} |`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
