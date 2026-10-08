import { describe, expect, it } from 'vitest';

import {
  answeredWithFirstOptions,
  planTurnProblems,
  questionTurnProblems,
} from '../../../scripts/lib/fixture-questions.mjs';

/**
 * A question as the SDK hands it to `canUseTool`.
 *
 * @param {string} text
 * @param {string[]} labels
 * @param {Record<string, unknown>} [extra]
 */
const question = (text, labels, extra = {}) => ({
  question: text,
  header: 'H',
  multiSelect: false,
  options: labels.map((label) => ({ label, description: '' })),
  ...extra,
});

describe('answeredWithFirstOptions — plan 24, B-11', () => {
  it('answers every question with its first option, keyed by its text — S-56', () => {
    const input = {
      questions: [
        question('Which?', ['A (Recommended)', 'B']),
        question('Which ones?', ['X', 'Y']),
      ],
      metadata: { source: 'remember' },
    };

    expect(answeredWithFirstOptions(input)).toEqual({
      ...input,
      answers: { 'Which?': 'A (Recommended)', 'Which ones?': 'X' },
    });
  });

  it('answers nothing it cannot read, and leaves the input as it came', () => {
    expect(answeredWithFirstOptions({})).toEqual({ answers: {} });
    expect(
      answeredWithFirstOptions({
        questions: ['text', { question: 'Q?', options: [] }, { options: [{}] }],
      }),
    ).toMatchObject({ answers: {} });
  });
});

describe('questionTurnProblems — plan 24, B-11, R-04', () => {
  /** @param {unknown[]} questions */
  const asked = (questions) => [{ toolName: 'AskUserQuestion', input: { questions } }];

  it('finds nothing missing in a call of several questions, a multiple one and a preview — S-57', () => {
    expect(
      questionTurnProblems([
        { toolName: 'Write', input: {} },
        ...asked([
          question('Sections?', ['Usage', 'License'], { multiSelect: true }),
          question('Format?', [], {
            options: [
              { label: 'Short', description: '', preview: '# Title' },
              { label: 'Long', description: '' },
            ],
          }),
        ]),
      ]),
    ).toEqual([]);
  });

  it('says what the model left out — S-57', () => {
    expect(questionTurnProblems([])).toEqual(['Claude asked no question']);
    expect(questionTurnProblems(asked([question('Only?', ['A', 'B'])]))).toEqual([
      'one call asked 1 question(s), not two or more',
      'no question was of multiple choice',
      'no option had a preview',
    ]);
    expect(questionTurnProblems([{ toolName: 'AskUserQuestion', input: null }])).toEqual([
      'one call asked 0 question(s), not two or more',
      'no question was of multiple choice',
      'no option had a preview',
    ]);
  });

  it('judges the fullest call, when Claude asked more than once', () => {
    expect(
      questionTurnProblems([
        ...asked([question('First?', ['A', 'B'])]),
        ...asked([
          question('Second?', ['A', 'B'], { multiSelect: true }),
          question('Third?', [], { options: [{ label: 'A', preview: 'x' }, { label: 'B' }] }),
        ]),
      ]),
    ).toEqual([]);
  });
});

describe('planTurnProblems', () => {
  it('needs a question and a plan', () => {
    expect(
      planTurnProblems([{ toolName: 'AskUserQuestion' }, { toolName: 'ExitPlanMode' }]),
    ).toEqual([]);
    expect(planTurnProblems([{ toolName: 'ExitPlanMode' }])).toEqual([
      'Claude asked no question before the plan',
    ]);
    expect(planTurnProblems([])).toEqual([
      'Claude asked no question before the plan',
      'Claude presented no plan',
    ]);
  });
});
