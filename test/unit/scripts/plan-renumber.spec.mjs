import { describe, expect, it } from 'vitest';

import {
  directoryMoves,
  shiftedNumber,
  shiftReferences,
  suspectLines,
} from '../../../scripts/lib/plan-renumber.mjs';

const shift = { from: 10, slugs: ['search', 'claude-settings', 'distribution'] };

describe('shiftedNumber', () => {
  it('moves the plan at the insertion point and every plan above it, and nothing below', () => {
    expect(shiftedNumber(9, shift)).toBe(9);
    expect(shiftedNumber(10, shift)).toBe(11);
    expect(shiftedNumber(19, shift)).toBe(20);
  });
});

describe('shiftReferences', () => {
  it('rewrites a plan directory, in a path and in a progress bar', () => {
    expect(shiftReferences('[busca](../10-search/README.md#d-02--motor)', shift)).toBe(
      '[busca](../11-search/README.md#d-02--motor)',
    );
    expect(shiftReferences('10-search           ░░░░   0%', shift)).toBe(
      '11-search           ░░░░   0%',
    );
  });

  it('leaves a directory of a plan that does not move, and a slug that only looks like one', () => {
    expect(shiftReferences('09-chat-layout · 10-searching · 10-search-v2', shift)).toBe(
      '09-chat-layout · 10-searching · 10-search-v2',
    );
  });

  it('rewrites a plan named as one, in Portuguese and in English, with its title', () => {
    expect(shiftReferences('# Plano 12 — Configuração do Claude', shift)).toBe(
      '# Plano 13 — Configuração do Claude',
    );
    expect(shiftReferences('see plan 18, B-04', shift)).toBe('see plan 19, B-04');
    expect(shiftReferences('o plano 08 e o plano 10', shift)).toBe('o plano 08 e o plano 11');
  });

  it('rewrites every number of a list or a range, bold or not, and only the ones that move', () => {
    expect(shiftReferences('os planos **06 a 17**', shift)).toBe('os planos **06 a 18**');
    expect(shiftReferences('planos 06–17', shift)).toBe('planos 06–18');
    expect(shiftReferences('plans 09, 10 and 12', shift)).toBe('plans 09, 11 and 13');
    expect(shiftReferences('os planos 10…19', shift)).toBe('os planos 11…20');
  });

  it('maps each number once, from the original text — 12 becomes 13 and 13 becomes 14', () => {
    expect(shiftReferences('planos 12 e 13', shift)).toBe('planos 13 e 14');
  });

  it('never reads a year or a longer number as a plan', () => {
    expect(shiftReferences('o plano 12 e 2026-10-02', shift)).toBe('o plano 13 e 2026-10-02');
    expect(shiftReferences('plano 120', shift)).toBe('plano 120');
  });

  it('rewrites a cross reference to a decision, a task, a scenario, a risk or a phase', () => {
    expect(
      shiftReferences('(12 · D-15) · 18 · B-04 · 13 · S-200 · 16 · R-02 · 11 · F3', shift),
    ).toBe('(13 · D-15) · 19 · B-04 · 14 · S-200 · 17 · R-02 · 12 · F3');
    expect(shiftReferences('08 · D-16', shift)).toBe('08 · D-16');
  });

  it('leaves a number followed by a dot that is not a cross reference', () => {
    expect(shiftReferences('11 · verdes', shift)).toBe('11 · verdes');
  });

  it('rewrites a plan named in a link fragment, so the link follows its rewritten heading', () => {
    expect(
      shiftReferences('[D-15](decisions.md#d-15--a-fronteira-com-os-planos-07-11-e-12)', shift),
    ).toBe('[D-15](decisions.md#d-15--a-fronteira-com-os-planos-07-12-e-13)');
    expect(
      shiftReferences('(decisions.md#d-02--a-ordem-em-relação-aos-planos-05-e-18)', shift),
    ).toBe('(decisions.md#d-02--a-ordem-em-relação-aos-planos-05-e-19)');
  });

  it('leaves a fragment that names no plan, and text outside a fragment', () => {
    expect(shiftReferences('(README.md#planejamento-12)', shift)).toBe(
      '(README.md#planejamento-12)',
    );
    expect(shiftReferences('planos-07-11', shift)).toBe('planos-07-11');
  });

  it('rewrites a link whose text is just the number of the plan it opens', () => {
    expect(shiftReferences('a distribuição ([18](18-distribution/README.md))', shift)).toBe(
      'a distribuição ([19](19-distribution/README.md))',
    );
    expect(shiftReferences('[08](../08-claude-panel/README.md) · [3](note.md)', shift)).toBe(
      '[08](../08-claude-panel/README.md) · [3](note.md)',
    );
  });

  it('rewrites a link titled with the plan number', () => {
    expect(shiftReferences('Plano: [10 — Busca](README.md)', shift)).toBe(
      'Plano: [11 — Busca](README.md)',
    );
  });

  it('rewrites the number cell of a row of the plan index, and no other table', () => {
    expect(shiftReferences('| 10 | [Busca](10-search/README.md) | 🔲 não iniciado |', shift)).toBe(
      '| 11 | [Busca](11-search/README.md) | 🔲 não iniciado |',
    );
    expect(shiftReferences('| 10 | [nota](https://example.com) |', shift)).toBe(
      '| 10 | [nota](https://example.com) |',
    );
  });

  it('leaves a bare number alone — "11 portões" is a count', () => {
    expect(shiftReferences('portões 1-11, sai com código 0 · o 18 empacota', shift)).toBe(
      'portões 1-11, sai com código 0 · o 18 empacota',
    );
  });

  it('rewrites only the explicit forms when there are no slugs to move', () => {
    expect(shiftReferences('10-search · plano 10', { from: 10, slugs: [] })).toBe(
      '10-search · plano 11',
    );
  });

  it('gives the same text back when nothing names a plan that moves', () => {
    const text = 'plano 05 · 08 · D-16 · ADR-010 · S-12';

    expect(shiftReferences(text, shift)).toBe(text);
  });
});

describe('suspectLines', () => {
  it('reports a bare number that may be a plan, with its line', () => {
    const text = 'linha um\no 18 empacota o produto';

    expect(suspectLines(text, text, shift)).toEqual([{ line: 2, text: 'o 18 empacota o produto' }]);
  });

  it('does not report a bare number below the insertion point, nor a measure', () => {
    const text = 'depois do 08 · até 15 % · no 12 px';

    expect(suspectLines(text, text, shift)).toEqual([]);
  });

  it('reports a changed line that tells the story of an earlier renumbering', () => {
    const before = 'os planos 09…18 passaram a 10…19';
    const after = shiftReferences(before, shift);

    expect(suspectLines(before, after, shift)).toEqual([{ line: 1, text: after }]);
  });

  it('does not report an unchanged story — nothing was rewritten in it', () => {
    const text = 'os planos 01…08 passaram a 02…09';

    expect(suspectLines(text, text, shift)).toEqual([]);
  });
});

describe('directoryMoves', () => {
  it('moves the plans from the insertion point up, the highest first', () => {
    const plans = [
      { name: '09-chat-layout', number: 9 },
      { name: '10-search', number: 10 },
      { name: '19-dev-public', number: 19 },
    ];

    expect(directoryMoves(plans, 10)).toEqual([
      { from: '19-dev-public', to: '20-dev-public' },
      { from: '10-search', to: '11-search' },
    ]);
  });

  it('moves nothing when the plan goes at the end', () => {
    expect(directoryMoves([{ name: '09-chat-layout', number: 9 }], 10)).toEqual([]);
  });
});
