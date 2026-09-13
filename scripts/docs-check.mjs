#!/usr/bin/env node
/**
 * Validates the documentation graph: broken internal link, missing anchor, and document that
 * does not appear in the index of its own area.
 *
 * It exists because no other gate catches this, and because the documentation *is* the
 * interface of the agent with the project — an outdated index makes routing silently useless.
 *
 * Usage: `pnpm docs:check`
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { inspectDocs } from './lib/docs-graph.mjs';
import { bold, dim, fail, hint, line, ok, title } from './lib/ui.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  title('docs-check');

  const { problems, documentCount, indexedCount } = inspectDocs({ rootDir: repoRoot });

  line(dim(`${documentCount} documents · ${indexedCount} under docs/ checked for indexing`));

  if (problems.length === 0) {
    ok('documentation graph is whole', 'no broken link, no missing anchor, no orphan document');
    return 0;
  }

  /** @type {Map<string, typeof problems>} */
  const byFile = new Map();
  for (const problem of problems) {
    const bucket = byFile.get(problem.file) ?? [];
    bucket.push(problem);
    byFile.set(problem.file, bucket);
  }

  for (const [file, fileProblems] of byFile) {
    line();
    line(bold(file));
    for (const problem of fileProblems) {
      fail(`${problem.line === 0 ? file : `${file}:${problem.line}`} — ${problem.message}`);
      hint(problem.fix);
    }
  }

  line();
  fail(`${problems.length} problem(s) in the documentation graph`);
  return 1;
}

process.exitCode = main();
