import { describe, expect, it } from 'vitest';

import { readToolQuestion } from '@/features/session/services/tool-question';
import { anInteraction } from '../../../../support/question';

describe('readToolQuestion — plan 24, B-22', () => {
  it('reads the questions, how they ended, the answers and the reason', () => {
    const question = readToolQuestion({
      interaction: anInteraction(),
      outcome: 'declined',
      answers: [{ questionId: 'q1', selected: ['Usage'] }],
      reason: 'Not now.',
    });

    expect(question?.interaction.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(question).toMatchObject({
      outcome: 'declined',
      answers: [{ questionId: 'q1', selected: ['Usage'], other: null }],
      reason: 'Not now.',
    });
  });

  it('reads an end it has no record of as no end, no answers and no reason', () => {
    expect(readToolQuestion({ interaction: anInteraction() })).toMatchObject({
      outcome: null,
      answers: null,
      reason: null,
    });
  });

  it('reads an end this build does not know as none', () => {
    expect(readToolQuestion({ interaction: anInteraction(), outcome: 'lost' })?.outcome).toBeNull();
  });

  it.each([
    undefined,
    null,
    'text',
    {},
    { interaction: 'none' },
    { interaction: { kind: 'plan' } },
  ])('is nothing for %j', (value) => {
    expect(readToolQuestion(value)).toBeNull();
  });
});
