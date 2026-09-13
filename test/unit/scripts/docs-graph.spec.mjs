import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { indexesFor, inspectDocs, resolveTarget } from '../../../scripts/lib/docs-graph.mjs';

/** @type {string[]} */
const created = [];

/**
 * Writes a fixture documentation tree and returns its root.
 *
 * @param {Record<string, string>} files path inside the tree → content
 * @returns {string}
 */
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-graph-'));
  created.push(root);

  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  return root;
}

afterEach(() => {
  while (created.length > 0) {
    fs.rmSync(created.pop() ?? '', { recursive: true, force: true });
  }
});

const wholeGraph = {
  'README.md': '# Repo\n\n- [docs](docs/README.md)\n',
  'docs/README.md': '# Index\n\n- [guide](guide.md)\n',
  'docs/guide.md': '# Guide\n\n## A section\n\nback to the [index](README.md#index)\n',
};

describe('inspectDocs', () => {
  it('reports nothing when every link, anchor and index is in place', () => {
    const result = inspectDocs({ rootDir: tree(wholeGraph) });

    expect(result.problems).toEqual([]);
    expect(result.documentCount).toBe(3);
    expect(result.indexedCount).toBe(2);
  });

  it('catches a link that points nowhere', () => {
    const root = tree({
      ...wholeGraph,
      'docs/guide.md': '# Guide\n\nsee [the missing one](missing.md)\n',
    });

    const [problem, ...rest] = inspectDocs({ rootDir: root }).problems;

    expect(rest).toEqual([]);
    expect(problem?.kind).toBe('broken-link');
    expect(problem?.file).toBe('docs/guide.md');
    expect(problem?.line).toBe(3);
  });

  it('catches an anchor no heading produces', () => {
    const root = tree({
      ...wholeGraph,
      'docs/guide.md': '# Guide\n\nsee [the index](README.md#no-such-heading)\n',
    });

    const [problem] = inspectDocs({ rootDir: root }).problems;

    expect(problem?.kind).toBe('missing-anchor');
    expect(problem?.message).toContain('#no-such-heading');
  });

  it('catches a document that no index lists', () => {
    const root = tree({ ...wholeGraph, 'docs/orphan.md': '# Orphan\n' });

    const [problem] = inspectDocs({ rootDir: root }).problems;

    expect(problem?.kind).toBe('orphan-document');
    expect(problem?.file).toBe('docs/orphan.md');
    expect(problem?.fix).toContain('docs/README.md');
  });

  it('accepts a document listed by the index of an ancestor directory', () => {
    const root = tree({
      'README.md': '# Repo\n\n- [docs](docs/README.md)\n- [deep](docs/area/deep.md)\n',
      'docs/README.md': '# Index\n',
      'docs/area/deep.md': '# Deep\n',
    });

    expect(inspectDocs({ rootDir: root }).problems).toEqual([]);
  });

  it('does not let a document index itself', () => {
    const root = tree({
      'README.md': '# Repo\n\n- [docs](docs/README.md)\n',
      'docs/README.md': '# Index\n\n[itself](README.md)\n',
      'docs/guide.md': '# Guide\n',
    });

    const kinds = inspectDocs({ rootDir: root }).problems.map((problem) => problem.kind);

    expect(kinds).toEqual(['orphan-document']);
  });

  it('leaves external links alone', () => {
    const root = tree({
      ...wholeGraph,
      'docs/guide.md': '# Guide\n\n[site](https://example.com/x.md) and [mail](mailto:a@b.c)\n',
    });

    expect(inspectDocs({ rootDir: root }).problems).toEqual([]);
  });

  it('finds the same problems on a second run — it changes nothing', () => {
    const root = tree({ ...wholeGraph, 'docs/orphan.md': '# Orphan\n' });

    expect(inspectDocs({ rootDir: root })).toEqual(inspectDocs({ rootDir: root }));
  });

  it('checks indexing only under the requested subtree', () => {
    const root = tree({ ...wholeGraph, 'notes/loose.md': '# Loose\n' });

    expect(inspectDocs({ rootDir: root }).problems).toEqual([]);
    expect(inspectDocs({ rootDir: root, docsDir: 'notes' }).problems).toHaveLength(1);
  });
});

describe('resolveTarget', () => {
  it('splits path from anchor', () => {
    const resolved = resolveTarget('/repo/docs/a.md', '../README.md#uma-seção');

    expect(resolved?.file).toBe('/repo/README.md');
    expect(resolved?.anchor).toBe('uma-seção');
  });

  it('resolves an anchor-only link against the document itself', () => {
    expect(resolveTarget('/repo/a.md', '#comandos')).toEqual({
      file: '/repo/a.md',
      anchor: 'comandos',
    });
  });

  it('decodes a percent-encoded target', () => {
    expect(resolveTarget('/repo/a.md', 'b.md#se%C3%A7%C3%A3o')?.anchor).toBe('seção');
  });

  it('answers null for an external target', () => {
    expect(resolveTarget('/repo/a.md', 'https://example.com')).toBeNull();
  });
});

describe('indexesFor', () => {
  it('offers the own directory index first, then the ancestors and the roots', () => {
    const root = tree({
      'README.md': '#\n',
      'AGENTS.md': '#\n',
      'docs/README.md': '#\n',
      'docs/area/README.md': '#\n',
      'docs/area/file.md': '#\n',
    });

    const indexes = indexesFor(path.join(root, 'docs/area/file.md'), root, [
      'AGENTS.md',
      'README.md',
    ]).map((absolute) => path.relative(root, absolute));

    expect(indexes).toEqual(['docs/area/README.md', 'docs/README.md', 'README.md', 'AGENTS.md']);
  });
});
