/**
 * The documentation seen as a graph, and the three ways it breaks: a link that points nowhere,
 * an anchor that no heading produces, and a document that no index lists.
 *
 * Kept apart from the CLI (`scripts/docs-check.mjs`) so it can be exercised against a fixture
 * tree in the unit suite.
 */

import fs from 'node:fs';
import path from 'node:path';

import { anchorsOf, findMarkdownFiles, linksOf } from './markdown.mjs';

const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * @typedef {object} DocProblem
 * @property {'broken-link' | 'missing-anchor' | 'orphan-document'} kind
 * @property {string} file repository-relative path
 * @property {number} line 1-based; 0 when the problem is about the document itself
 * @property {string} message
 * @property {string} fix what to do about it
 */

/**
 * @typedef {object} DocsGraphOptions
 * @property {string} rootDir repository root
 * @property {string} [docsDir] subtree whose documents must be indexed; defaults to `docs/`
 * @property {readonly string[]} [rootIndexes] files that may index anything; default AGENTS/README
 */

/**
 * @typedef {object} DocsGraphResult
 * @property {DocProblem[]} problems
 * @property {number} documentCount every Markdown file inspected
 * @property {number} indexedCount documents subject to the index rule
 */

/**
 * Reads each file once — the graph revisits the same indexes many times.
 *
 * @param {string} rootDir
 */
function makeReader(rootDir) {
  /** @type {Map<string, string>} */
  const contents = new Map();
  /** @type {Map<string, Set<string>>} */
  const anchors = new Map();

  return {
    /**
     * @param {string} absolutePath
     * @returns {string}
     */
    content(absolutePath) {
      const cached = contents.get(absolutePath);
      if (cached !== undefined) {
        return cached;
      }
      const text = fs.readFileSync(absolutePath, 'utf8');
      contents.set(absolutePath, text);
      return text;
    },

    /**
     * @param {string} absolutePath
     * @returns {Set<string>}
     */
    anchors(absolutePath) {
      const cached = anchors.get(absolutePath);
      if (cached !== undefined) {
        return cached;
      }
      const computed = anchorsOf(this.content(absolutePath));
      anchors.set(absolutePath, computed);
      return computed;
    },

    /**
     * @param {string} absolutePath
     * @returns {string}
     */
    relative(absolutePath) {
      return path.relative(rootDir, absolutePath).split(path.sep).join('/');
    },
  };
}

/**
 * Resolves a link target against the document that wrote it.
 *
 * @param {string} fromFile
 * @param {string} target
 * @returns {{ file: string, anchor: string } | null} null when the target is external
 */
export function resolveTarget(fromFile, target) {
  if (EXTERNAL_TARGET.test(target)) {
    return null;
  }

  const hashIndex = target.indexOf('#');
  const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? '' : decodeURIComponent(target.slice(hashIndex + 1));

  const file =
    rawPath === '' ? fromFile : path.resolve(path.dirname(fromFile), decodeURIComponent(rawPath));

  return { file, anchor };
}

/**
 * The indexes allowed to list a document: the README of its own directory, the README of any
 * ancestor directory up to the root, and the roots of the repository.
 *
 * @param {string} absolutePath
 * @param {string} rootDir
 * @param {readonly string[]} rootIndexes
 * @returns {string[]}
 */
export function indexesFor(absolutePath, rootDir, rootIndexes) {
  /** @type {string[]} */
  const candidates = [];

  let dir = path.dirname(absolutePath);
  while (dir.startsWith(rootDir)) {
    const readme = path.join(dir, 'README.md');
    if (readme !== absolutePath && fs.existsSync(readme)) {
      candidates.push(readme);
    }
    if (dir === rootDir) {
      break;
    }
    dir = path.dirname(dir);
  }

  for (const name of rootIndexes) {
    const rootIndex = path.join(rootDir, name);
    if (rootIndex !== absolutePath && fs.existsSync(rootIndex) && !candidates.includes(rootIndex)) {
      candidates.push(rootIndex);
    }
  }

  return candidates;
}

/** @typedef {ReturnType<typeof makeReader>} Reader */
/** @typedef {import('./markdown.mjs').MarkdownLink} MarkdownLink */

/**
 * What is wrong with one link of [file], if anything: a target that does not exist, or an anchor
 * that no heading of the target produces. External targets and anchors into anything other than
 * Markdown are not judged.
 *
 * @param {Reader} read
 * @param {string} file the document that wrote the link
 * @param {MarkdownLink} link
 * @returns {DocProblem | null}
 */
function linkProblem(read, file, link) {
  const resolved = resolveTarget(file, link.target);
  if (resolved === null) {
    return null;
  }

  if (!fs.existsSync(resolved.file)) {
    return {
      kind: 'broken-link',
      file: read.relative(file),
      line: link.line,
      message: `broken link: ${link.target}`,
      fix: `nothing at ${read.relative(resolved.file)} — fix the path or create the file`,
    };
  }

  if (resolved.anchor === '' || !resolved.file.endsWith('.md')) {
    return null;
  }

  if (read.anchors(resolved.file).has(resolved.anchor.toLowerCase())) {
    return null;
  }

  return {
    kind: 'missing-anchor',
    file: read.relative(file),
    line: link.line,
    message: `missing anchor: ${link.target}`,
    fix: `no heading in ${read.relative(resolved.file)} anchors as #${resolved.anchor}`,
  };
}

/**
 * The problem of a document under `docs/` that none of the indexes allowed to list it does.
 *
 * @param {Reader} read
 * @param {string} file
 * @param {readonly string[]} indexes as [indexesFor] answers them for [file]
 * @returns {DocProblem | null}
 */
function orphanProblem(read, file, indexes) {
  const listed = indexes.some((index) =>
    linksOf(read.content(index)).some((link) => {
      const resolved = resolveTarget(index, link.target);
      return resolved !== null && resolved.file === file;
    }),
  );

  if (listed) {
    return null;
  }

  const where = indexes.map((index) => read.relative(index)).join(' or ');
  return {
    kind: 'orphan-document',
    file: read.relative(file),
    line: 0,
    message: 'document is listed in no index',
    fix: `add it to ${where === '' ? 'the index of its area' : where}`,
  };
}

/**
 * Walks the whole graph and returns every problem found.
 *
 * @param {DocsGraphOptions} options
 * @returns {DocsGraphResult}
 */
export function inspectDocs(options) {
  const rootDir = path.resolve(options.rootDir);
  const docsDir = path.resolve(rootDir, options.docsDir ?? 'docs');
  const rootIndexes = options.rootIndexes ?? ['AGENTS.md', 'README.md'];
  const read = makeReader(rootDir);

  /** @type {(DocProblem | null)[]} */
  const found = [];
  const documents = findMarkdownFiles(rootDir);

  for (const file of documents) {
    for (const link of linksOf(read.content(file))) {
      found.push(linkProblem(read, file, link));
    }
  }

  const indexed = fs.existsSync(docsDir) ? findMarkdownFiles(docsDir) : [];

  for (const file of indexed) {
    found.push(orphanProblem(read, file, indexesFor(file, rootDir, rootIndexes)));
  }

  const problems = found.filter((problem) => problem !== null);
  return { problems, documentCount: documents.length, indexedCount: indexed.length };
}
