import { describe, expect, it } from 'vitest';

import {
  buildPlanFiles,
  isValidSlug,
  titleize,
  withPlanIndexed,
} from '../../../scripts/lib/plan-template.mjs';

const spec = { number: '01', slug: 'claude-integration', phases: ['discovery', 'streaming'] };

describe('buildPlanFiles', () => {
  it('generates the three fixed files plus one file per phase', () => {
    const names = buildPlanFiles(spec).map((file) => file.name);

    expect(names).toEqual([
      'README.md',
      'scenarios.md',
      'progress.md',
      'F0-discovery.md',
      'F1-streaming.md',
    ]);
  });

  it('generates only the three fixed files plus one phase for a single-phase plan', () => {
    const names = buildPlanFiles({ ...spec, phases: ['foundation'] }).map((file) => file.name);

    expect(names).toHaveLength(4);
    expect(names.at(-1)).toBe('F0-foundation.md');
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
