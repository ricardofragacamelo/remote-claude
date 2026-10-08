import { describe, expect, it } from 'vitest';

import { withAnswers } from '@adapter/outbound/claude/question-answers';
import { QUESTION_LIMITS } from '@domain/permission';

/** An `AskUserQuestion` input as the SDK gives it, with the metadata it may carry. */
const input = {
  questions: [
    {
      question: 'Which library?',
      header: 'Library',
      multiSelect: false,
      options: [
        { label: 'date-fns (Recommended)', description: 'small' },
        { label: 'luxon', description: 'zones' },
      ],
    },
    {
      question: 'Which checks?',
      header: 'Checks',
      multiSelect: true,
      options: [
        { label: 'Lint, strict', description: 'a label with the separator in it' },
        { label: 'Tests', description: 'unit' },
        { label: 'Other', description: 'an option literally called Other' },
      ],
    },
  ],
  metadata: { source: 'remember' },
};

describe('withAnswers — B-09', () => {
  it('keeps the questions and the metadata, and keys each answer by the text of its question — S-46', () => {
    const updated = withAnswers(input, [
      { questionId: 'q1', selected: ['date-fns (Recommended)'], other: null },
      { questionId: 'q2', selected: ['Tests'], other: null },
    ]);

    expect(updated).toEqual({
      ...input,
      answers: { 'Which library?': 'date-fns (Recommended)', 'Which checks?': 'Tests' },
    });
  });

  it('joins the labels of a multiple choice with ", ", whatever the labels contain — S-47', () => {
    const updated = withAnswers(input, [
      { questionId: 'q1', selected: ['luxon'], other: null },
      { questionId: 'q2', selected: ['Lint, strict', 'Other'], other: null },
    ]);

    expect(updated['answers']).toEqual({
      'Which library?': 'luxon',
      'Which checks?': 'Lint, strict, Other',
    });
  });

  it('puts the free answer in place of the label, or after the labels of a multiple choice — S-48', () => {
    const updated = withAnswers(input, [
      { questionId: 'q1', selected: [], other: 'a library of our own' },
      { questionId: 'q2', selected: ['Tests'], other: 'and the CI' },
    ]);

    expect(updated['answers']).toEqual({
      'Which library?': 'a library of our own',
      'Which checks?': 'Tests, and the CI',
    });
  });

  it('gives back the label and the question Claude wrote, when the screen showed them cut — S-49', () => {
    const longLabel = `${'l'.repeat(QUESTION_LIMITS.label)} and more`;
    const longPrompt = `${'p'.repeat(QUESTION_LIMITS.prompt)} and more?`;
    const shownLabel = `${'l'.repeat(QUESTION_LIMITS.label - 1)}…`;
    const long = {
      questions: [
        {
          question: longPrompt,
          header: 'Long',
          multiSelect: false,
          options: [
            { label: longLabel, description: '' },
            { label: 'Short', description: '' },
          ],
        },
      ],
    };

    expect(
      withAnswers(long, [{ questionId: 'q1', selected: [shownLabel], other: null }])['answers'],
    ).toEqual({ [longPrompt]: longLabel });
  });

  it('skips an answer to a question the input does not have, and gives an unknown label back as it is', () => {
    // Validated before it gets here; this is only what the translation does if it ever is not.
    expect(
      withAnswers(input, [
        { questionId: 'q9', selected: ['luxon'], other: null },
        { questionId: 'q1', selected: ['neither'], other: null },
      ])['answers'],
    ).toEqual({ 'Which library?': 'neither' });
  });
});
