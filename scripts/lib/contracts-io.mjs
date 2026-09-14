/**
 * Where the contract lives on disk, and how the generated files are compared with it.
 *
 * Kept apart from the script so `pnpm contracts:generate` and `pnpm contracts:check` are the
 * same code path with one flag between them — a check that ran different code from the
 * generator would eventually pass while the generated files were wrong.
 */

import fs from 'node:fs';
import path from 'node:path';

import { buildModel } from './contracts-model.mjs';
import { emitDart } from './contracts-dart.mjs';
import { emitTypeScript } from './contracts-typescript.mjs';

/** Source of truth. */
export const SCHEMA_DIR = 'packages/contracts/schema';

/** The envelope, which every message extends. */
export const ENVELOPE = 'envelope.schema.json';

/**
 * Every message schema, in a stable order.
 *
 * Sorted by path rather than taken from the directory listing: the generated files are
 * committed, so the output has to depend only on the schemas, not on the order a filesystem
 * happens to return them in.
 *
 * @param {string} rootDir
 * @returns {string[]} paths relative to `rootDir`
 */
export function messageSchemas(rootDir) {
  const base = path.join(rootDir, SCHEMA_DIR);

  /** @param {string} dir @returns {string[]} absolute paths */
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return walk(full);
      }

      return entry.isFile() && entry.name.endsWith('.schema.json') ? [full] : [];
    });
  }

  // Relativised once, at the end: doing it inside `walk` would relativise the results of the
  // recursive call a second time, and every nested schema would resolve outside `rootDir`.
  return walk(base)
    .map((full) => path.relative(rootDir, full).split(path.sep).join('/'))
    .filter((relative) => relative !== `${SCHEMA_DIR}/${ENVELOPE}`)
    .sort();
}

/**
 * @param {string} rootDir
 * @param {string} relative
 * @returns {import('./contracts-model.mjs').Document}
 */
function read(rootDir, relative) {
  return {
    source: relative,
    schema: /** @type {Record<string, unknown>} */ (
      JSON.parse(fs.readFileSync(path.join(rootDir, relative), 'utf8'))
    ),
  };
}

/**
 * @typedef {object} Target
 * @property {string} name what to call it in the output
 * @property {string} file repository-relative path of the generated file
 * @property {string} content what it should contain
 */

/**
 * What the schemas say the generated files should be.
 *
 * @param {string} rootDir
 * @returns {Target[]}
 */
export function targets(rootDir) {
  const model = buildModel(
    read(rootDir, `${SCHEMA_DIR}/${ENVELOPE}`),
    messageSchemas(rootDir).map((relative) => read(rootDir, relative)),
  );

  return [
    {
      name: 'TypeScript',
      file: 'packages/contracts/src/protocol.ts',
      content: emitTypeScript(model),
    },
    {
      name: 'Dart',
      // `.g.dart` is Dart's convention for generated source, and what the Flutter analyzer
      // and the duplication gate already recognise as such.
      file: 'mobile/lib/core/network/contracts/protocol.g.dart',
      content: emitDart(model),
    },
  ];
}

/**
 * Writes a target, creating its directory. Answers whether anything changed.
 *
 * @param {string} rootDir
 * @param {Target} target
 * @returns {boolean}
 */
export function write(rootDir, target) {
  const full = path.join(rootDir, target.file);
  const before = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;

  if (before === target.content) {
    return false;
  }

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, target.content);
  return true;
}

/**
 * Why a target is out of sync, or null when it is not.
 *
 * @param {string} rootDir
 * @param {Target} target
 * @returns {string | null}
 */
export function drift(rootDir, target) {
  const full = path.join(rootDir, target.file);

  if (!fs.existsSync(full)) {
    return 'has never been generated';
  }

  return fs.readFileSync(full, 'utf8') === target.content ? null : 'is out of sync with the schema';
}
