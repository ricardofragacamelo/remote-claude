import { afterEach, describe, expect, it } from 'vitest';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  anchorsOf,
  findMarkdownFiles,
  linesOutsideCode,
  linksOf,
  slugify,
} from '../../../scripts/lib/markdown.mjs';

describe('slugify', () => {
  it('lowercases and turns spaces into hyphens', () => {
    expect(slugify('Onde o teste mora')).toBe('onde-o-teste-mora');
  });

  it('keeps accents, as GitHub does', () => {
    expect(slugify('Configuração e segredo')).toBe('configuração-e-segredo');
  });

  it('drops punctuation, which is what doubles the hyphen around an em dash', () => {
    expect(slugify('ADR-007 — pnpm workspaces (com o Flutter fora)')).toBe(
      'adr-007--pnpm-workspaces-com-o-flutter-fora',
    );
  });

  it('strips inline formatting and code spans', () => {
    expect(slugify('`docs-check.mjs`')).toBe('docs-checkmjs');
    expect(slugify('**Estágio 0** — plano')).toBe('estágio-0--plano');
  });

  it('uses the text of a link, not its target', () => {
    expect(slugify('See [the protocol](11-validation-protocol.md)')).toBe('see-the-protocol');
  });

  it('returns an empty slug for a heading with nothing anchorable', () => {
    expect(slugify('— · —')).toBe('--');
  });
});

describe('linesOutsideCode', () => {
  it('blanks fenced blocks while keeping line numbering', () => {
    const content = ['before', '```bash', '# not a heading', '```', 'after'].join('\n');

    expect(linesOutsideCode(content)).toEqual(['before', '', '', '', 'after']);
  });

  it('only closes a fence with the same marker it opened', () => {
    const content = ['~~~', '```', 'still inside', '~~~', 'outside'].join('\n');

    expect(linesOutsideCode(content).at(-1)).toBe('outside');
    expect(linesOutsideCode(content)[2]).toBe('');
  });
});

describe('anchorsOf', () => {
  it('collects one anchor per heading', () => {
    const anchors = anchorsOf('# Título\n\n## Uma seção\n');

    expect([...anchors]).toEqual(['título', 'uma-seção']);
  });

  it('gives no anchor to a heading with nothing a slug can be made of', () => {
    expect([...anchorsOf('# Real\n\n## !!!\n')]).toEqual(['real']);
  });

  it('ignores headings inside code blocks', () => {
    const anchors = anchorsOf('# Real\n\n```sh\n# Fake\n```\n');

    expect([...anchors]).toEqual(['real']);
  });

  it('suffixes repeated headings the way GitHub does', () => {
    const anchors = anchorsOf('## Tarefas\n## Tarefas\n## Tarefas\n');

    expect([...anchors]).toEqual(['tarefas', 'tarefas-1', 'tarefas-2']);
  });
});

describe('linksOf', () => {
  it('reports target and line of every link', () => {
    const content = 'intro\n\nsee [the plan](docs/plans/README.md#fases) for more\n';

    expect(linksOf(content)).toEqual([{ target: 'docs/plans/README.md#fases', line: 3 }]);
  });

  it('ignores links inside code fences and inline code', () => {
    const content = ['`[fake](nowhere.md)`', '```', '[also fake](nowhere.md)', '```'].join('\n');

    expect(linksOf(content)).toEqual([]);
  });

  it('handles a link whose text contains brackets', () => {
    expect(linksOf('[see [this]](target.md)')).toEqual([{ target: 'target.md', line: 1 }]);
  });
});

describe('findMarkdownFiles', () => {
  /** @type {string[]} */
  const made = [];

  afterEach(() => {
    for (const dir of made.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds every Markdown file below the root, sorted, and skips the directories it is told to', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-md-'));
    made.push(root);
    for (const file of ['b.md', 'a/c.md', 'node_modules/x.md', 'a/not-markdown.txt']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), '# x\n');
    }

    expect(findMarkdownFiles(root).map((file) => path.relative(root, file))).toEqual([
      path.join('a', 'c.md'),
      'b.md',
    ]);
    expect(findMarkdownFiles(root, []).map((file) => path.relative(root, file))).toContain(
      path.join('node_modules', 'x.md'),
    );
  });
});
