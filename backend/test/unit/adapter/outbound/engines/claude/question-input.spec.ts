import { describe, expect, it } from 'vitest';

import { normalizeQuestion } from '@adapter/outbound/engines/claude/question-input';
import { QUESTION_LIMITS } from '@domain/engine';
import type { QuestionInteraction } from '@domain/engine';

/** One option, as the SDK gives it. */
function option(label: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { label, description: `about ${label}`, ...extra };
}

/** One question, as the SDK gives it. */
function sdkQuestion(
  question: string,
  labels: readonly string[] = ['Yes', 'No'],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    question,
    header: 'Header',
    multiSelect: false,
    options: labels.map((label) => option(label)),
    ...extra,
  };
}

/** The interaction of an input, which every validation case starts from. */
function interactionOf(...questions: Record<string, unknown>[]): QuestionInteraction {
  return normalizeQuestion({ questions });
}

/** The first entry of a list a test knows is not empty. */
function first<T>(entries: readonly T[]): T {
  const [entry] = entries;
  if (entry === undefined) {
    throw new Error('the list was empty');
  }
  return entry;
}

describe('normalizeQuestion — B-04', () => {
  it('reads one single-choice question into an interaction of ours — S-05', () => {
    expect(
      normalizeQuestion({
        questions: [sdkQuestion('Which library?', ['date-fns', 'luxon'], { header: 'Library' })],
        metadata: { source: 'remember' },
      }),
    ).toEqual({
      kind: 'question',
      malformed: false,
      questions: [
        {
          id: 'q1',
          header: 'Library',
          prompt: 'Which library?',
          originalPrompt: 'Which library?',
          multiSelect: false,
          options: [
            {
              label: 'date-fns',
              description: 'about date-fns',
              preview: null,
              originalLabel: 'date-fns',
            },
            { label: 'luxon', description: 'about luxon', preview: null, originalLabel: 'luxon' },
          ],
        },
      ],
    });
  });

  it('numbers four questions of four options in the order they came — S-06', () => {
    const interaction = interactionOf(
      ...['One?', 'Two?', 'Three?', 'Four?'].map((text) =>
        sdkQuestion(text, ['A', 'B', 'C', 'D'], { multiSelect: true }),
      ),
    );

    expect(interaction.malformed).toBe(false);
    expect(interaction.questions.map((question) => [question.id, question.prompt])).toEqual([
      ['q1', 'One?'],
      ['q2', 'Two?'],
      ['q3', 'Three?'],
      ['q4', 'Four?'],
    ]);
    expect(interaction.questions.every((question) => question.options.length === 4)).toBe(true);
    expect(interaction.questions[0]?.multiSelect).toBe(true);
  });

  it('accepts a question of two options, the least there may be — S-07', () => {
    expect(interactionOf(sdkQuestion('Proceed?', ['Yes', 'No'])).malformed).toBe(false);
  });

  it('cuts every text past its bound instead of refusing it — S-08', () => {
    const long = (size: number): string => 'x'.repeat(size + 50);
    const interaction = interactionOf({
      question: long(QUESTION_LIMITS.prompt),
      header: long(QUESTION_LIMITS.header),
      multiSelect: false,
      options: [
        option(long(QUESTION_LIMITS.label), {
          description: long(QUESTION_LIMITS.description),
          preview: long(QUESTION_LIMITS.preview),
        }),
        option('Short'),
      ],
    });

    const question = first(interaction.questions);
    const cutOption = first(question.options);
    expect(interaction.malformed).toBe(false);
    expect(question.prompt).toHaveLength(QUESTION_LIMITS.prompt);
    expect(question.prompt.endsWith('…')).toBe(true);
    expect(question.originalPrompt).toHaveLength(QUESTION_LIMITS.prompt + 50);
    expect(question.header).toHaveLength(QUESTION_LIMITS.header);
    expect(cutOption.label).toHaveLength(QUESTION_LIMITS.label);
    expect(cutOption.originalLabel).toHaveLength(QUESTION_LIMITS.label + 50);
    expect(cutOption.description).toHaveLength(QUESTION_LIMITS.description);
    expect(cutOption.preview).toHaveLength(QUESTION_LIMITS.preview);
  });

  it('never cuts a character outside the basic plane in half', () => {
    // An emoji is two UTF-16 units; one that straddles the cut is dropped whole.
    const prompt = `${'x'.repeat(QUESTION_LIMITS.prompt - 2)}😀😀`;
    const cut = interactionOf(sdkQuestion(prompt)).questions[0]?.prompt ?? '';

    expect(cut).toBe(`${'x'.repeat(QUESTION_LIMITS.prompt - 2)}…`);
  });

  it('keeps a text at exactly its bound whole', () => {
    const header = 'h'.repeat(QUESTION_LIMITS.header);

    expect(interactionOf(sdkQuestion('Q?', ['A', 'B'], { header })).questions[0]?.header).toBe(
      header,
    );
  });

  it.each([
    ['no question at all', []],
    ['five questions', ['1?', '2?', '3?', '4?', '5?'].map((text) => sdkQuestion(text))],
    ['one option', [sdkQuestion('Q?', ['Only'])]],
    ['five options', [sdkQuestion('Q?', ['A', 'B', 'C', 'D', 'E'])]],
    [
      'an option with no label',
      [{ question: 'Q?', header: 'H', options: [option(''), option('B')] }],
    ],
    [
      'an option with a blank label',
      [{ question: 'Q?', header: 'H', options: [option('  '), option('B')] }],
    ],
    [
      'an option that is not an object',
      [{ question: 'Q?', header: 'H', options: ['A', option('B')] }],
    ],
  ])('reads %s as malformed — S-09', (_case, questions) => {
    expect(normalizeQuestion({ questions })).toEqual({
      kind: 'question',
      malformed: true,
      questions: [],
    });
  });

  it('reads a question with no options — the open question of the extended mode — as malformed — S-10', () => {
    expect(
      normalizeQuestion({ questions: [{ question: 'Name it?', header: 'Name', kind: 'text' }] })
        .malformed,
    ).toBe(true);
  });

  it.each([
    ['the same question twice', [sdkQuestion('Same?'), sdkQuestion('Same?')]],
    ['the same label twice in one question', [sdkQuestion('Q?', ['A', 'A'])]],
  ])('reads %s as malformed — S-11', (_case, questions) => {
    expect(normalizeQuestion({ questions }).malformed).toBe(true);
  });

  it('leaves "(Recommended)" in the label, which the answer needs exactly — S-12', () => {
    const [question] = interactionOf(sdkQuestion('Q?', ['Fast (Recommended)', 'Slow'])).questions;

    expect(question?.options[0]?.label).toBe('Fast (Recommended)');
  });

  it.each([
    ['no questions field', {}],
    ['questions that are not a list', { questions: 'Which?' }],
    ['a question that is not an object', { questions: ['Which?'] }],
    ['a question that is null', { questions: [null] }],
    ['a question that is a list', { questions: [['Which?']] }],
    [
      'a question with no text',
      { questions: [{ header: 'H', options: [option('A'), option('B')] }] },
    ],
    ['a question with a blank text', { questions: [sdkQuestion('   ')] }],
  ])('reads an input with %s as malformed — S-12', (_case, input) => {
    expect(normalizeQuestion(input).malformed).toBe(true);
  });

  it('tolerates what the SDK may leave out: a header, a description, a preview, multiSelect', () => {
    const [question] = interactionOf({
      question: 'Q?',
      options: [{ label: 'A' }, { label: 'B', preview: '   ' }],
    }).questions;

    expect(question).toMatchObject({ header: '', multiSelect: false });
    expect(question?.options.map((entry) => [entry.description, entry.preview])).toEqual([
      ['', null],
      ['', null],
    ]);
  });

  it('keeps a preview, which is markdown and shown as such', () => {
    const [question] = interactionOf(
      sdkQuestion('Q?', [], {
        options: [option('A', { preview: '```ts\nconst a = 1;\n```' }), option('B')],
      }),
    ).questions;

    expect(question?.options[0]?.preview).toBe('```ts\nconst a = 1;\n```');
  });
});
