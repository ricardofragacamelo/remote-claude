import { describe, expect, it } from 'vitest';

import {
  buildPlanFiles,
  e2eLast,
  isValidSlug,
  titleize,
  withPlanIndexed,
  withPlanInOverallProgress,
} from '../../../scripts/lib/plan-template.mjs';

const spec = { number: '01', slug: 'claude-integration', phases: ['discovery', 'streaming'] };

describe('buildPlanFiles', () => {
  it('generates the three fixed files plus one file per phase', () => {
    const names = buildPlanFiles(spec).map((file) => file.name);

    expect(names).toEqual([
      'README.md',
      'scenarios.md',
      'decisions.md',
      'progress.md',
      'F0-discovery.md',
      'F1-streaming.md',
    ]);
  });

  it('generates only the four fixed files plus one phase for a single-phase plan', () => {
    const names = buildPlanFiles({ ...spec, phases: ['foundation'] }).map((file) => file.name);

    expect(names).toHaveLength(5);
    expect(names.at(-1)).toBe('F0-foundation.md');
  });

  it('gives the decisions file one section per phase, and says when a phase has none', () => {
    const content =
      buildPlanFiles(spec).find((file) => file.name === 'decisions.md')?.content ?? '';

    expect(content).toContain('## F0 — Discovery');
    expect(content).toContain('## F1 — Streaming');
    expect(content).toContain('| D-01 |');
    expect(content).toContain('nenhuma decisão em aberto');
  });

  it('gives the plan README the sections the format requires', () => {
    const readme = buildPlanFiles(spec).find((file) => file.name === 'README.md')?.content ?? '';

    for (const heading of ['## Escopo', '## Fases', '## Rastreio', '## Riscos']) {
      expect(readme).toContain(heading);
    }
    expect(readme).toContain('pnpm verify:full');
    expect(readme).toContain('[Discovery](F0-discovery.md)');
  });

  it('numbers task IDs across the whole plan, never restarting per phase', () => {
    const files = buildPlanFiles(spec);

    expect(files.find((file) => file.name === 'F0-discovery.md')?.content).toContain('### B-01');
    expect(files.find((file) => file.name === 'F1-streaming.md')?.content).toContain('### B-02');
  });

  it('points each phase at the previous one, and says when there is none', () => {
    const files = buildPlanFiles(spec);

    expect(files.find((file) => file.name === 'F0-discovery.md')?.content).toContain(
      '**Depende de:** nada. É a primeira fase.',
    );
    expect(files.find((file) => file.name === 'F1-streaming.md')?.content).toContain(
      '[F0](F0-discovery.md)',
    );
  });

  it('starts the progress counters at zero, with one bar per phase', () => {
    const progress =
      buildPlanFiles(spec).find((file) => file.name === 'progress.md')?.content ?? '';

    expect(progress).toContain('F0 ');
    expect(progress).toContain('F1 ');
    expect(progress).toContain('| **Total** | **—** | **0/0** | 🔲 |');
  });
});

describe('withPlanIndexed', () => {
  const index = [
    '# Planos',
    '',
    '| # | Plano | Estado | Critério de conclusão |',
    '|---|---|---|---|',
    '| 00 | [Bootstrap](00-bootstrap/README.md) | 🔲 | `pnpm verify:full` |',
    '',
    '## Formato obrigatório',
  ].join('\n');

  it('appends the new plan after the last row of the table', () => {
    const lines = withPlanIndexed(index, spec).split('\n');

    expect(lines[5]).toContain('[Claude integration](01-claude-integration/README.md)');
    expect(lines[6]).toBe('');
  });

  it('puts a plan created in the middle right after the last one numbered below it', () => {
    const shifted = [
      '| # | Plano | Estado | Critério de conclusão |',
      '|---|---|---|---|',
      '| 00 | [Bootstrap](00-bootstrap/README.md) | ✅ | `pnpm verify:full` |',
      '| 02 | [Search](02-search/README.md) | 🔲 | `pnpm verify:full` |',
    ].join('\n');

    const lines = withPlanIndexed(shifted, spec).split('\n');

    expect(lines[3]).toContain('(01-claude-integration/README.md)');
    expect(lines[4]).toContain('(02-search/README.md)');
  });

  it('puts plan 00 above every other row', () => {
    const lines = withPlanIndexed(index, { ...spec, number: '00', slug: 'zero' }).split('\n');

    expect(lines[4]).toContain('(00-zero/README.md)');
    expect(lines[5]).toContain('(00-bootstrap/README.md)');
  });

  it('refuses to guess when there is no table', () => {
    expect(() => withPlanIndexed('# Planos\n\nnenhum ainda.\n', spec)).toThrow(/no plan table/);
  });
});

describe('slug handling', () => {
  it('accepts kebab-case only', () => {
    expect(isValidSlug('claude-integration')).toBe(true);
    expect(isValidSlug('bootstrap')).toBe(true);
    expect(isValidSlug('Claude_Integration')).toBe(false);
    expect(isValidSlug('claude--integration')).toBe(false);
    expect(isValidSlug('-leading')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });

  it('turns a slug into a title', () => {
    expect(titleize('claude-integration')).toBe('Claude integration');
    expect(titleize('bootstrap')).toBe('Bootstrap');
  });
});

describe('withPlanInOverallProgress', () => {
  const overall = [
    '| Plano | Fases | Tarefas | Cenários | Decisões | Estado |',
    '|---|---|---|---|---|---|',
    '| [00 — Bootstrap](00-bootstrap/README.md) | 8/8 | 52/52 | 118/119 | 5/6 | ✅ |',
    '| **Total** | **8/8** | **52/52** | **118/119** | **5/6** | ✅ |',
  ].join('\n');

  it('adds the new plan right after the last one, above the total, with every counter', () => {
    const lines = withPlanInOverallProgress(overall, spec).split('\n');

    expect(lines[3]).toBe(
      '| [01 — Claude integration](01-claude-integration/README.md) | 0/0 | 0/0 | 0/0 | 0/0 | 🔲 |',
    );
    expect(lines[4]).toContain('**Total**');
  });

  it('ignores prose tables that also link to plans, wherever they sit', () => {
    const withProse = [
      overall,
      '',
      '| Plano | Entrega a capacidade de… | Depende de |',
      '|---|---|---|',
      '| [00 — Bootstrap](00-bootstrap/README.md) | o trilho | — |',
    ].join('\n');

    const lines = withPlanInOverallProgress(withProse, spec).split('\n');

    expect(lines[3]).toContain('[01 — Claude integration]');
    expect(lines.at(-1)).toBe('| [00 — Bootstrap](00-bootstrap/README.md) | o trilho | — |');
  });

  it('puts a plan created in the middle between its neighbours, not above the total', () => {
    const shifted = [
      '| Plano | Fases | Tarefas | Cenários | Decisões | Estado |',
      '|---|---|---|---|---|---|',
      '| [00 — Bootstrap](00-bootstrap/README.md) | 8/8 | 52/52 | 118/119 | 5/6 | ✅ |',
      '| [02 — Search](02-search/README.md) | 0/4 | 0/9 | 0/40 | 0/3 | 🔲 |',
      '| **Total** | **8/12** | **52/61** | **118/159** | **5/9** | 🔄 |',
    ].join('\n');

    const lines = withPlanInOverallProgress(shifted, spec).split('\n');

    expect(lines[3]).toContain('[01 — Claude integration]');
    expect(lines[4]).toContain('[02 — Search]');
    expect(lines[5]).toContain('**Total**');
  });

  it('refuses a document with no plan table — a plan outside the map is a plan nobody follows', () => {
    expect(() => withPlanInOverallProgress('# Progresso geral\n', spec)).toThrow(
      /docs\/plans\/progress\.md has no plan table/,
    );
  });
});

describe('e2eLast — every plan ends with its E2E phase', () => {
  it.each([
    [['foundation'], ['foundation', 'e2e']],
    [
      ['backend', 'e2e', 'web'],
      ['backend', 'web', 'e2e'],
    ],
    [
      ['backend', 'e2e'],
      ['backend', 'e2e'],
    ],
    [[], ['e2e']],
  ])('turns %j into %j', (asked, phases) => {
    expect(e2eLast(asked)).toEqual(phases);
  });
});
