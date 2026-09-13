/**
 * Reading Markdown as a graph: headings, anchors and internal links.
 *
 * The documentation of this repository *is* the interface between the project and whoever works
 * on it, agents included. `docs-check` walks it with what is here; nothing else parses Markdown
 * by hand.
 */

import fs from 'node:fs';
import path from 'node:path';

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const LINK = /!?\[(?:[^[\]]|\[[^[\]]*\])*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const INLINE_CODE = /`[^`\n]*`/g;

/**
 * Blanks out fenced code blocks, keeping line numbering intact.
 *
 * Without this a `# comment` inside a shell sample becomes a heading, and a link inside a code
 * sample becomes a broken link.
 *
 * @param {string} content
 * @returns {string[]} one entry per line
 */
export function linesOutsideCode(content) {
  const lines = content.split('\n');
  /** @type {string[]} */
  const result = [];
  /** @type {string | null} */
  let openFence = null;

  for (const rawLine of lines) {
    const fence = FENCE.exec(rawLine);

    if (openFence === null && fence !== null) {
      openFence = fence[1] ?? '```';
      result.push('');
      continue;
    }

    if (openFence !== null) {
      if (fence !== null && fence[1] === openFence) {
        openFence = null;
      }
      result.push('');
      continue;
    }

    result.push(rawLine);
  }

  return result;
}

/**
 * The anchor GitHub generates for a heading.
 *
 * Lowercase, formatting stripped, every character that is neither letter, digit, space, hyphen
 * nor underscore removed, spaces turned into hyphens. Accents are kept, and repeated spaces do
 * become repeated hyphens — that is why `## ADR-007 — pnpm workspaces` anchors as
 * `adr-007--pnpm-workspaces`.
 *
 * @param {string} headingText
 * @returns {string}
 */
export function slugify(headingText) {
  return headingText
    .replace(/!?\[((?:[^[\]]|\[[^[\]]*\])*)\]\([^)]*\)/g, '$1')
    .replace(/[`*~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-');
}

/**
 * Every anchor a document offers, in document order, with GitHub's `-1`, `-2` suffixes for
 * repeated headings.
 *
 * @param {string} content
 * @returns {Set<string>}
 */
export function anchorsOf(content) {
  /** @type {Set<string>} */
  const anchors = new Set();
  /** @type {Map<string, number>} */
  const seen = new Map();

  for (const rawLine of linesOutsideCode(content)) {
    const heading = HEADING.exec(rawLine);
    if (heading === null) {
      continue;
    }

    const slug = slugify(heading[2] ?? '');
    if (slug === '') {
      continue;
    }

    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }

  return anchors;
}

/**
 * @typedef {object} MarkdownLink
 * @property {string} target raw link target, as written
 * @property {number} line 1-based line number
 */

/**
 * Every link of a document, excluding those inside code blocks and inline code spans.
 *
 * @param {string} content
 * @returns {MarkdownLink[]}
 */
export function linksOf(content) {
  /** @type {MarkdownLink[]} */
  const links = [];

  linesOutsideCode(content).forEach((rawLine, index) => {
    const line = rawLine.replace(INLINE_CODE, (match) => ' '.repeat(match.length));

    for (const match of line.matchAll(LINK)) {
      const target = match[1];
      if (target !== undefined) {
        links.push({ target, line: index + 1 });
      }
    }
  });

  return links;
}

/**
 * Every Markdown file under a directory, sorted, skipping the directories that are never
 * documentation.
 *
 * @param {string} rootDir
 * @param {readonly string[]} [skipDirs]
 * @returns {string[]} absolute paths
 */
export function findMarkdownFiles(rootDir, skipDirs = ['node_modules', '.git', 'dist', 'build']) {
  /** @type {string[]} */
  const found = [];

  /** @param {string} dir */
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          walk(full);
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        found.push(full);
      }
    }
  }

  walk(rootDir);
  return found.sort();
}
