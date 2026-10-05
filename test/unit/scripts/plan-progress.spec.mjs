import { describe, expect, it } from 'vitest';

import {
  applyIndexStates,
  applyOverallProgress,
  applyPhaseStates,
  applyProgress,
  changedBeyondTheDate,
  openDecisionIds,
  openDecisionsBlock,
  overallProblems,
  parseDecisions,
  formatTaskRange,
  parseScenarios,
  parseTasks,
  planProgressProblems,
  sortPlanRows,
  summarizeOverall,
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

describe('parseDecisions', () => {
  const table = [
    '| ID | Decisão | Gap | Bloqueia | Resultado | Estado |',
    '|---|---|---|---|---|---|',
    '| D-01 | a | b | B-01 | — | 🔲 |',
    '| D-02 | c | d | B-02 | 2026-09-15 — escolhida | ✅ |',
    '| — | nenhuma decisão em aberto | — | — | — | — |',
  ].join('\n');

  it('counts each decision by state, ignoring the row a phase uses to say it has none', () => {
    expect(parseDecisions(table)).toEqual({
      total: 2,
      counts: { '🔲': 1, '🔄': 0, '✅': 1, '⛔': 0 },
    });
  });

  it('answers zero for a plan whose decisions file is still empty', () => {
    expect(parseDecisions('')).toEqual({
      total: 0,
      counts: { '🔲': 0, '🔄': 0, '✅': 0, '⛔': 0 },
    });
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
  '## Decisões',
  '',
  '| | Total | 🔲 | 🔄 | ✅ | ⛔ |',
  '|---|---|---|---|---|---|',
  '| [Decisões](decisions.md) | 0 | 0 | 0 | 0 | 0 |',
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
    '| D-01 | a | b | B-01 | — | 🔲 |\n| D-02 | c | d | B-03 | feita | ✅ |',
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

  it('rewrites the decision counts', () => {
    expect(updated).toContain('| [Decisões](decisions.md) | 2 | 1 | 0 | 1 | 0 |');
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

describe('a phase with nothing in it', () => {
  it('draws an empty bar rather than dividing by zero', () => {
    const summary = summarizePlan(
      [
        { index: 0, file: 'F0-a.md', content: '# no tasks here yet\n' },
        { index: 1, file: 'F1-b.md', content: '### B-03 — x ✅' },
      ],
      '',
    );

    const updated = applyProgress(progressDocument, summary, { date: '2026-09-14' });

    expect(updated).toContain('F0 ░░░░░░░░░░░░░░░░░░░░   0%');
    expect(updated).toContain('F1 ████████████████████ 100%');
  });
});

/**
 * @param {string} content a phase file
 * @param {string} matrix the scenario rows
 * @param {string} [decisions] the decision rows
 */
const planOf = (content, matrix, decisions) =>
  summarizePlan([{ index: 0, file: 'F0-a.md', content }], matrix, decisions);

const donePlan = {
  dir: '00-a',
  summary: planOf(
    '### B-01 — x ✅',
    '| S-01 | a | eq | unit | — | B-01 | ✅ |',
    '| D-01 | a | b | B-01 | feita | ✅ |',
  ),
};

const openPlan = {
  dir: '01-b',
  summary: planOf(
    '### B-01 — x 🔲\n### B-02 — y 🔲',
    '| S-01 | a | eq | unit | — | B-01 | ⬜ |',
    '| D-01 | a | b | B-01 | — | 🔲 |',
  ),
};

const twoPlans = [donePlan, openPlan];

describe('summarizeOverall', () => {
  it('adds up phases, tasks and scenarios across every plan', () => {
    const overall = summarizeOverall(twoPlans);

    expect(overall.phasesDone).toBe(1);
    expect(overall.phaseTotal).toBe(2);
    expect(overall.taskDone).toBe(1);
    expect(overall.taskTotal).toBe(3);
    expect(overall.scenarioDone).toBe(1);
    expect(overall.scenarioTotal).toBe(2);
    expect(overall.decisionDone).toBe(1);
    expect(overall.decisionTotal).toBe(2);
  });

  it('reads the project as ongoing while any plan is done and another is not', () => {
    expect(summarizeOverall(twoPlans).state).toBe('🔄');
  });

  it('reads the project as done only when every plan is done', () => {
    const done = summarizeOverall([
      donePlan,
      { dir: '01-b', summary: planOf('### B-01 — y ✅', '') },
    ]);

    expect(done.state).toBe('✅');
  });

  it('lets a blocked plan win over everything else', () => {
    const blocked = summarizeOverall([
      donePlan,
      { dir: '01-b', summary: planOf('### B-01 — y ⛔', '') },
    ]);

    expect(blocked.state).toBe('⛔');
  });

  it('answers zero for a repository with no plan at all', () => {
    const empty = summarizeOverall([]);

    expect(empty.taskTotal).toBe(0);
    expect(empty.state).toBe('🔲');
  });
});

const overallDocument = [
  '# Planos — progresso geral',
  '',
  '## Panorama',
  '',
  '**Última atualização:** 2020-01-01',
  '',
  '```',
  '00-a ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado',
  '```',
  '',
  '## Por plano',
  '',
  '| Plano | Fases | Tarefas | Cenários | Decisões | Estado |',
  '|---|---|---|---|---|---|',
  '| [01 — B](01-b/README.md) | 0/0 | 0/0 | 0/0 | 0/0 | 🔲 |',
  '| [00 — A](00-a/README.md) | 0/0 | 0/0 | 0/0 | 0/0 | 🔲 |',
  '| **Total** | **0/0** | **0/0** | **0/0** | **0/0** | 🔲 |',
  '',
  '## Decisões em aberto',
  '',
  '<!-- open-decisions:start -->',
  'stale, written by hand',
  '<!-- open-decisions:end -->',
  '',
  '## Onde o projeto está',
  '',
  '| Plano | Entrega | Depende de |',
  '|---|---|---|',
  '| [01 — B](01-b/README.md) | uma linha de prosa | 00 |',
  '',
  'hand-written, and it stays as it is.',
  '',
].join('\n');

describe('applyOverallProgress', () => {
  const overall = summarizeOverall(twoPlans);
  const updated = applyOverallProgress(overallDocument, overall, { date: '2026-09-15' });

  it('rewrites one row per plan, keeping the link text', () => {
    expect(updated).toContain('| [00 — A](00-a/README.md) | 1/1 | 1/1 | 1/1 | 1/1 | ✅ |');
    expect(updated).toContain('| [01 — B](01-b/README.md) | 0/1 | 0/2 | 0/1 | 0/1 | 🔲 |');
  });

  it('rewrites the total', () => {
    expect(updated).toContain('| **Total** | **1/2** | **1/3** | **1/2** | **1/2** | 🔄 |');
  });

  it('puts the plans in the order of their numbers — a plan created later is not left last', () => {
    expect(updated.indexOf('[00 — A](00-a/README.md) | 1/1')).toBeLessThan(
      updated.indexOf('[01 — B](01-b/README.md) | 0/1'),
    );
  });

  it('writes the decisions still open in place of whatever was between the markers', () => {
    expect(updated).not.toContain('stale, written by hand');
    expect(updated).toContain('| [01-b](01-b/decisions.md) | D-01 | 1 |');
  });

  it('draws one bar per plan, aligned by the widest name', () => {
    expect(updated).toContain('00-a ████████████████████ 100%   ✅ concluído');
    expect(updated).toContain('01-b ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado');
  });

  it('leaves a prose table that links to the same plan untouched', () => {
    expect(updated).toContain('| [01 — B](01-b/README.md) | uma linha de prosa | 00 |');
    expect(updated).toContain('hand-written, and it stays as it is.');
  });

  it('stamps the date', () => {
    expect(updated).toContain('**Última atualização:** 2026-09-15');
  });

  it('is idempotent — running it again changes nothing', () => {
    expect(applyOverallProgress(updated, overall, { date: '2026-09-15' })).toBe(updated);
  });

  it('refuses a document without the markers of the open decisions', () => {
    const withoutMarkers = overallDocument.replace('<!-- open-decisions:end -->', '');

    expect(() => applyOverallProgress(withoutMarkers, overall, { date: '2026-09-15' })).toThrow(
      /open decisions block/,
    );
  });

  it('refuses to half-update, naming the plan whose row is missing', () => {
    const withoutSecond = overallDocument
      .split('\n')
      .filter((text) => !text.startsWith('| [01 — B](01-b/README.md) | 0/0'))
      .join('\n');

    expect(() => applyOverallProgress(withoutSecond, overall, { date: '2026-09-15' })).toThrow(
      /docs\/plans\/progress\.md is not in the normative format.*01-b/s,
    );
  });
});

const indexDocument = [
  '# Planos — índice e formato normativo',
  '',
  '| # | Plano | Estado | Critério de conclusão |',
  '|---|---|---|---|',
  '| 00 | [A](00-a/README.md) | 🔄 em andamento | `pnpm verify:full` sai com código 0 |',
  '| 01 | [B](01-b/README.md) | ✅ concluído | `pnpm verify:full` **e** `pnpm x` saem com código 0 |',
  '',
  'A prosa cita o [plano A](00-a/README.md), e fica como está.',
  '',
].join('\n');

describe('applyIndexStates', () => {
  const overall = summarizeOverall(twoPlans);
  const updated = applyIndexStates(indexDocument, overall);

  it('rewrites the state of each plan from its tasks, keeping title and criterion', () => {
    expect(updated).toContain(
      '| 00 | [A](00-a/README.md) | ✅ concluído | `pnpm verify:full` sai com código 0 |',
    );
    expect(updated).toContain(
      '| 01 | [B](01-b/README.md) | 🔲 não iniciado | `pnpm verify:full` **e** `pnpm x` saem com código 0 |',
    );
  });

  it('leaves prose that links to a plan untouched', () => {
    expect(updated).toContain('A prosa cita o [plano A](00-a/README.md), e fica como está.');
  });

  it('is idempotent — running it again changes nothing', () => {
    expect(applyIndexStates(updated, overall)).toBe(updated);
  });

  it('refuses to half-update, naming the plan missing from the index', () => {
    const withoutSecond = indexDocument
      .split('\n')
      .filter((text) => !text.startsWith('| 01 |'))
      .join('\n');

    expect(() => applyIndexStates(withoutSecond, overall)).toThrow(
      /docs\/plans\/README\.md is not in the normative format.*01-b/s,
    );
  });
});

// The hand-written parts of the progress documents, checked against the counters.
describe('openDecisionIds', () => {
  it('lists the decisions not yet taken — 🔲 and 🔄 — once each, in the order of the file', () => {
    const decisions = [
      '| D-03 | a | b | F0 | — | 🔄 |',
      '| D-01 | a | b | F0 | — | 🔲 |',
      '| D-02 | a | b | F0 | feita | ✅ |',
      '| D-04 | a | b | F0 | — | ⛔ |',
      '| D-01 | repeated | b | F0 | — | 🔲 |',
      '| — | nenhuma decisão em aberto | — | — | — | — |',
    ].join('\n');

    expect(openDecisionIds(decisions)).toEqual(['D-03', 'D-01']);
  });

  it('answers none for a plan without decisions', () => {
    expect(openDecisionIds('')).toEqual([]);
  });
});

describe('formatTaskRange with another prefix', () => {
  it('collapses decisions the way it collapses tasks', () => {
    expect(formatTaskRange(['D-01', 'D-02', 'D-03', 'D-07'], 'D-')).toBe('D-01…D-03, D-07');
  });
});

describe('openDecisionsBlock', () => {
  it('says so when no plan has an open decision', () => {
    expect(openDecisionsBlock(summarizeOverall([donePlan]).plans)).toBe(
      'Nenhuma decisão em aberto em plano nenhum.',
    );
  });
});

describe('sortPlanRows', () => {
  it('leaves a document with no plan row as it is', () => {
    expect(sortPlanRows('# nothing here\n')).toBe('# nothing here\n');
  });
});

const planReadme = [
  '| Fase | Arquivo | Entrega | Tarefas | Estado |',
  '|---|---|---|---|---|',
  '| F0 | [Normas](F0-norms.md) | as normas | B-01 | 🔲 |',
  '| F1 | [E2E](F1-e2e.md) | o e2e | B-02 | 🔄 |',
  '',
  'A [F0](F0-norms.md) é citada em prosa, e fica como está.',
  '',
].join('\n');

describe('applyPhaseStates', () => {
  const summary = summarizePlan(
    [
      { index: 0, file: 'F0-norms.md', content: '### B-01 — x ✅' },
      { index: 1, file: 'F1-e2e.md', content: '### B-02 — y 🔲' },
    ],
    '',
  );
  const updated = applyPhaseStates(planReadme, summary, '00-a');

  it('rewrites the state of each phase from its tasks, and nothing else', () => {
    expect(updated).toContain('| F0 | [Normas](F0-norms.md) | as normas | B-01 | ✅ |');
    expect(updated).toContain('| F1 | [E2E](F1-e2e.md) | o e2e | B-02 | 🔲 |');
    expect(updated.split('\n')).toHaveLength(planReadme.split('\n').length);
    expect(updated).toContain('A [F0](F0-norms.md) é citada em prosa, e fica como está.');
  });

  it('is idempotent — running it again changes nothing', () => {
    expect(applyPhaseStates(updated, summary, '00-a')).toBe(updated);
  });

  it('refuses a README without the row of a phase, naming the plan and the phase', () => {
    const withoutF1 = planReadme.replace(/^\| F1 .*$/m, '');

    expect(() => applyPhaseStates(withoutF1, summary, '00-a')).toThrow(/00-a\/README\.md.*F1/s);
  });
});

describe('planProgressProblems', () => {
  const progressSaying = (/** @type {string} */ current) =>
    `## Estado atual\n\n**Fase corrente:** ${current}\n`;

  it('finds nothing to say about a plan whose line agrees with its tasks', () => {
    expect(
      planProgressProblems(progressSaying('nenhuma — o plano fechou'), donePlan.summary),
    ).toEqual([]);
    expect(
      planProgressProblems(progressSaying('nenhuma — plano não iniciado'), openPlan.summary),
    ).toEqual([]);
  });

  it('a plan with every task done that does not say it is concluded', () => {
    expect(planProgressProblems(progressSaying('F2 — em andamento'), donePlan.summary)).toEqual([
      'every task is done, and "Fase corrente" does not say the plan is concluded',
    ]);
  });

  it('a plan that says it has not started, with tasks done', () => {
    expect(
      planProgressProblems(progressSaying('nenhuma — plano não iniciado'), donePlan.summary),
    ).toEqual([
      'every task is done, and "Fase corrente" does not say the plan is concluded',
      '"Fase corrente" says it has not started, and 1 task(s) are done',
    ]);
  });

  it('a progress with no line of the current phase says nothing of a plan not started', () => {
    expect(planProgressProblems('', openPlan.summary)).toEqual([]);
  });
});

describe('overallProblems', () => {
  const overall = summarizeOverall(twoPlans);
  const generalProgress = (/** @type {string[]} */ ...lines) => lines.join('\n');
  const delivers = [
    '| Plano | Entrega | Depende de |',
    '|---|---|---|',
    '| [00 — A](00-a/README.md) | a | — |',
    '| [01 — B](01-b/README.md) | b | 00 |',
  ];

  it('finds nothing when every plan delivers something and the concluded one has its milestone', () => {
    const content = generalProgress(
      ...delivers,
      '## Histórico',
      '| 2026-01-01 | **Plano 00 — A concluído** | tudo |',
    );

    expect(overallProblems(content, overall)).toEqual([]);
  });

  it('a plan with no row in the table of what each plan delivers', () => {
    const content = generalProgress(
      String(delivers[0]),
      '| [00 — A](00-a/README.md) | a | — |',
      '## Histórico',
      '| 2026-01-01 | **Plano 00 — A concluído** | tudo |',
    );

    expect(overallProblems(content, overall)).toEqual([
      '01-b has no row in the table of what each plan delivers',
    ]);
  });

  it('a concluded plan whose milestone the history never wrote — mentions elsewhere do not count', () => {
    const content = generalProgress(
      ...delivers,
      '| prose before the history: Plano 00 concluído |',
      '## Histórico',
      '| 2026-01-01 | **Plano 00 — A criado** | o começo |',
    );

    expect(overallProblems(content, overall)).toEqual([
      '00-a is concluded, and the history has no "Plano 00 … concluído"',
    ]);
  });
});

describe('changedBeyondTheDate', () => {
  const at = (/** @type {string} */ date, /** @type {string} */ body) =>
    `# P\n\n**Última atualização:** ${date}\n\n${body}\n`;

  it('a new date alone is no change — the date says when the counters moved', () => {
    expect(changedBeyondTheDate(at('2026-01-01', '| 1/2 |'), at('2026-02-02', '| 1/2 |'))).toBe(
      false,
    );
  });

  it('a counter that moved is a change', () => {
    expect(changedBeyondTheDate(at('2026-01-01', '| 1/2 |'), at('2026-02-02', '| 2/2 |'))).toBe(
      true,
    );
  });
});
