import { describe, expect, it } from 'vitest';

import {
  applyProgress,
  formatTaskRange,
  parseScenarios,
  parseTasks,
  summarizePlan,
} from '../../../scripts/lib/plan-progress.mjs';

describe('parseTasks', () => {
  it('reads the state marker at the end of each task heading', () => {
    const content = ['### B-01 — done ✅', '### B-02 — running 🔄', '### B-03 — blocked ⛔'].join(
      '\n',
    );

    expect(parseTasks(content)).toEqual([
      { id: 'B-01', state: '✅' },
      { id: 'B-02', state: '🔄' },
      { id: 'B-03', state: '⛔' },
    ]);
  });

  it('counts an unmarked task as not started — absence is never read as done', () => {
    expect(parseTasks('### B-07 — no marker\n')).toEqual([{ id: 'B-07', state: '🔲' }]);
  });

  it('ignores headings of another level and prose mentioning a task', () => {
    const content = ['## B-99 — a section', 'talk about B-98 here', '### B-01 — real ✅'].join(
      '\n',
    );

    expect(parseTasks(content)).toEqual([{ id: 'B-01', state: '✅' }]);
  });
});

describe('parseScenarios', () => {
  const matrix = [
    '| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |',
    '|---|---|---|---|---|---|---|',
    '| S-01 | a | eq | unit | — | B-01 | ✅ |',
    '| S-02 | b | err | unit | — | B-01 | 🟡 |',
    '| S-03 | c | err | e2e | — | B-02 | ⬜ |',
    '| S-04 | d | conc | e2e | — | B-02 | ⛔ |',
  ].join('\n');

  it('counts each scenario by state', () => {
    expect(parseScenarios(matrix)).toEqual({
      total: 4,
      counts: { '⬜': 1, '🟡': 1, '✅': 1, '⛔': 1 },
    });
  });

  it('counts a repeated ID once', () => {
    expect(parseScenarios(`${matrix}\n| S-01 | a again | eq | unit | — | B-01 | ⬜ |`).total).toBe(
      4,
    );
  });

  it('answers zero for a matrix with no rows yet', () => {
    expect(parseScenarios('# Matriz\n').total).toBe(0);
  });
});

describe('formatTaskRange', () => {
  it('collapses runs of three or more, and lists the rest', () => {
    expect(
      formatTaskRange(['B-01', 'B-02', 'B-03', 'B-04', 'B-05', 'B-06', 'B-48', 'B-49', 'B-52']),
    ).toBe('B-01…B-06, B-48, B-49, B-52');
  });

  it('sorts before grouping', () => {
    expect(formatTaskRange(['B-23', 'B-15', 'B-16'])).toBe('B-15, B-16, B-23');
  });

  it('answers an em dash for no task at all', () => {
    expect(formatTaskRange([])).toBe('—');
  });
});

describe('summarizePlan', () => {
  const phases = [
    { index: 1, file: 'F1-b.md', content: '### B-03 — x 🔲' },
    { index: 0, file: 'F0-a.md', content: '### B-01 — x ✅\n### B-02 — y ✅' },
  ];

  it('orders phases by index and totals the tasks', () => {
    const summary = summarizePlan(phases, '');

    expect(summary.phases.map((phase) => phase.index)).toEqual([0, 1]);
    expect(summary.taskDone).toBe(2);
    expect(summary.taskTotal).toBe(3);
    expect(summary.taskRange).toBe('B-01…B-03');
  });

  it('marks a phase done only when every task of it is done', () => {
    const summary = summarizePlan(phases, '');

    expect(summary.phases[0]?.state).toBe('✅');
    expect(summary.phases[1]?.state).toBe('🔲');
    expect(summary.state).toBe('🔄');
  });

  it('lets a blocked task win over everything else', () => {
    const summary = summarizePlan([{ index: 0, file: 'F0.md', content: '### B-01 — x ⛔' }], '');

    expect(summary.state).toBe('⛔');
  });
});

const progressDocument = [
  '# Plano 00 — Progresso',
  '',
  '## Estado atual',
  '',
  '**Fase corrente:** nenhuma',
  '**Última atualização:** 2020-01-01',
  '',
  '```',
  'F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada',
  'F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada',
  '```',
  '',
  '## Tarefas',
  '',
  '| Fase | Tarefas | Concluídas | Estado |',
  '|---|---|---|---|',
  '| [F0](F0-a.md) | — | 0/0 | 🔲 |',
  '| [F1](F1-b.md) | — | 0/0 | 🔲 |',
  '| **Total** | **—** | **0/0** | 🔲 |',
  '',
  '## Cenários',
  '',
  '| | Total | ⬜ | 🟡 | ✅ | ⛔ |',
  '|---|---|---|---|---|---|',
  '| [Matriz](scenarios.md) | 0 | 0 | 0 | 0 | 0 |',
  '',
  '## Histórico de validação',
  '',
  'hand-written, and it stays as it is.',
  '',
].join('\n');

describe('applyProgress', () => {
  const summary = summarizePlan(
    [
      { index: 0, file: 'F0-a.md', content: '### B-01 — x ✅\n### B-02 — y ✅' },
      { index: 1, file: 'F1-b.md', content: '### B-03 — x 🔄\n### B-04 — y 🔲' },
    ],
    '| S-01 | a | eq | unit | — | B-01 | ✅ |\n| S-02 | b | eq | unit | — | B-03 | ⬜ |',
  );

  const updated = applyProgress(progressDocument, summary, { date: '2026-09-13' });

  it('rewrites the per-phase rows', () => {
    expect(updated).toContain('| [F0](F0-a.md) | B-01, B-02 | 2/2 | ✅ |');
    expect(updated).toContain('| [F1](F1-b.md) | B-03, B-04 | 0/2 | 🔄 |');
  });

  it('rewrites the total and the scenario counts', () => {
    expect(updated).toContain('| **Total** | **B-01…B-04** | **2/4** | 🔄 |');
    expect(updated).toContain('| [Matriz](scenarios.md) | 2 | 1 | 0 | 1 | 0 |');
  });

  it('redraws the bars to match the counters', () => {
    expect(updated).toContain('F0 ████████████████████ 100%   ✅ concluída');
    expect(updated).toContain('F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔄 em andamento');
  });

  it('stamps the date', () => {
    expect(updated).toContain('**Última atualização:** 2026-09-13');
  });

  it('leaves the hand-written sections untouched', () => {
    expect(updated).toContain('hand-written, and it stays as it is.');
    expect(updated).toContain('**Fase corrente:** nenhuma');
  });

  it('is idempotent — running it again changes nothing', () => {
    expect(applyProgress(updated, summary, { date: '2026-09-13' })).toBe(updated);
  });

  it('refuses to half-update a document outside the format', () => {
    expect(() =>
      applyProgress('# Progresso\n\nnada aqui.\n', summary, { date: '2026-09-13' }),
    ).toThrow(/not in the normative format/);
  });

  it('names every missing piece, not just the first', () => {
    try {
      applyProgress('# Progresso\n', summary, { date: '2026-09-13' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(String(error)).toContain('total row');
      expect(String(error)).toContain('scenario counts row');
    }
  });
});
