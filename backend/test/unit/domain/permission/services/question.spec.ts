import { describe, expect, it } from 'vitest';
import {
  QUESTION_ANSWER_LIMITS,
  QUESTION_INTERACTION_LIMITS,
  QUESTION_INTERACTION_QUESTIONS_ITEM_LIMITS,
  QUESTION_INTERACTION_QUESTIONS_ITEM_OPTIONS_ITEM_LIMITS,
} from '@remote-claude/contracts';

import {
  PermissionAnswersInvalidError,
  QUESTION_LIMITS,
  interactionFor,
  normalizeQuestion,
  validateAnswers,
} from '@domain/permission';
import type { QuestionAnswer, QuestionInteraction } from '@domain/permission';

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

/** One answer, with the free answer absent unless given. */
function answer(
  questionId: string,
  selected: string[],
  other: string | null = null,
): QuestionAnswer {
  return { questionId, selected, other };
}

/** The first entry of a list a test knows is not empty. */
function first<T>(entries: readonly T[]): T {
  const [entry] = entries;
  if (entry === undefined) {
    throw new Error('the list was empty');
  }
  return entry;
}

/** The rules a refusal reports, as `rule@question`. */
function refusalOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof PermissionAnswersInvalidError) {
      return error.problems.map((problem) => `${problem.rule}@${problem.questionId ?? '-'}`);
    }
    throw error;
  }
  throw new Error('the answers were accepted');
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

describe('interactionFor', () => {
  it('normalises the questions of AskUserQuestion and gives every other tool none', () => {
    expect(
      interactionFor('AskUserQuestion', { questions: [sdkQuestion('Q?')] })?.questions,
    ).toHaveLength(1);
    expect(interactionFor('Bash', { command: 'ls' })).toBeNull();
    expect(interactionFor('ExitPlanMode', { plan: '# plan' })).toBeNull();
  });
});

describe('the bounds of the domain are the contract`s', () => {
  it('reads the same numbers the generated contract declares', () => {
    // Written twice — the domain may not import the contract — and tied here, so they cannot drift.
    expect(QUESTION_LIMITS.questions).toBe(QUESTION_INTERACTION_LIMITS.questions.maxItems);
    expect(QUESTION_LIMITS.header).toBe(
      QUESTION_INTERACTION_QUESTIONS_ITEM_LIMITS.header.maxLength,
    );
    expect(QUESTION_LIMITS.prompt).toBe(
      QUESTION_INTERACTION_QUESTIONS_ITEM_LIMITS.prompt.maxLength,
    );
    expect(QUESTION_LIMITS.optionsMin).toBe(
      QUESTION_INTERACTION_QUESTIONS_ITEM_LIMITS.options.minItems,
    );
    expect(QUESTION_LIMITS.optionsMax).toBe(
      QUESTION_INTERACTION_QUESTIONS_ITEM_LIMITS.options.maxItems,
    );
    expect(QUESTION_LIMITS.label).toBe(
      QUESTION_INTERACTION_QUESTIONS_ITEM_OPTIONS_ITEM_LIMITS.label.maxLength,
    );
    expect(QUESTION_LIMITS.description).toBe(
      QUESTION_INTERACTION_QUESTIONS_ITEM_OPTIONS_ITEM_LIMITS.description.maxLength,
    );
    expect(QUESTION_LIMITS.preview).toBe(
      QUESTION_INTERACTION_QUESTIONS_ITEM_OPTIONS_ITEM_LIMITS.preview.maxLength,
    );
    expect(QUESTION_LIMITS.other).toBe(QUESTION_ANSWER_LIMITS.other.maxLength);
  });
});

describe('validateAnswers — B-05', () => {
  const single = sdkQuestion('Which?', ['A', 'B', 'C']);
  const multiple = sdkQuestion('Which ones?', ['Lint', 'Tests', 'Docs'], { multiSelect: true });
  const both = interactionOf(single, multiple);

  it('accepts one label on a single choice, two on a multiple choice, and a free answer alone — S-13', () => {
    expect(
      validateAnswers(both, 'allow', [answer('q1', ['A']), answer('q2', ['Lint', 'Tests'])]),
    ).toEqual([answer('q1', ['A']), answer('q2', ['Lint', 'Tests'])]);
    expect(
      validateAnswers(both, 'allow', [answer('q1', [], 'my own'), answer('q2', [], 'none')]),
    ).toEqual([answer('q1', [], 'my own'), answer('q2', [], 'none')]);
  });

  it('accepts labels and a free answer together on a multiple choice — S-14', () => {
    expect(
      validateAnswers(both, 'allow', [answer('q1', ['B']), answer('q2', ['Docs'], 'and the CI')]),
    ).toEqual([answer('q1', ['B']), answer('q2', ['Docs'], 'and the CI')]);
  });

  it('hands the answers on in the order of the questions, the free answer trimmed', () => {
    expect(
      validateAnswers(both, 'allow', [answer('q2', ['Lint']), answer('q1', [], '  spaced  ')]),
    ).toEqual([answer('q1', [], 'spaced'), answer('q2', ['Lint'])]);
  });

  it('refuses an allow with no answers to a question — S-15, S-23', () => {
    expect(refusalOf(() => validateAnswers(both, 'allow', null))).toEqual(['answersRequired@-']);
  });

  it('refuses a label that is not an option of the question, without echoing it — S-16', () => {
    try {
      validateAnswers(both, 'allow', [
        answer('q1', ['Z — something private']),
        answer('q2', ['Lint']),
      ]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionAnswersInvalidError);
      const refused = error as PermissionAnswersInvalidError;
      expect(refused.details).toEqual([{ field: 'answers.q1', rule: 'unknownOption' }]);
      expect(JSON.stringify({ ...refused, message: refused.message })).not.toContain('private');
    }
  });

  it.each([
    ['two labels', [answer('q1', ['A', 'B']), answer('q2', ['Lint'])]],
    ['a label and a free answer', [answer('q1', ['A'], 'mine'), answer('q2', ['Lint'])]],
  ])('refuses %s on a single choice — S-17', (_case, answers) => {
    expect(refusalOf(() => validateAnswers(both, 'allow', answers))).toEqual(['singleChoice@q1']);
  });

  it('refuses a question left unanswered, or answered with nothing — S-18', () => {
    expect(refusalOf(() => validateAnswers(both, 'allow', [answer('q1', ['A'])]))).toEqual([
      'unanswered@q2',
    ]);
    expect(
      refusalOf(() => validateAnswers(both, 'allow', [answer('q1', ['A']), answer('q2', [])])),
    ).toEqual(['unanswered@q2']);
  });

  it('refuses a question that does not exist, and a question answered twice — S-19', () => {
    expect(
      refusalOf(() =>
        validateAnswers(both, 'allow', [
          answer('q1', ['A']),
          answer('q2', ['Lint']),
          answer('q9', ['A']),
        ]),
      ),
    ).toEqual(['unknownQuestion@q9']);
    expect(
      refusalOf(() =>
        validateAnswers(both, 'allow', [
          answer('q1', ['A']),
          answer('q1', ['B']),
          answer('q2', ['Lint']),
        ]),
      ),
    ).toEqual(['repeatedQuestion@q1']);
  });

  it('refuses answers on a request that is not a question — S-20', () => {
    expect(refusalOf(() => validateAnswers(null, 'allow', [answer('q1', ['A'])]))).toEqual([
      'notAQuestion@-',
    ]);
  });

  it('refuses answers beside a refusal — S-21', () => {
    expect(refusalOf(() => validateAnswers(both, 'deny', [answer('q1', ['A'])]))).toEqual([
      'answersOnRefusal@-',
    ]);
  });

  it('refuses a free answer of nothing but spaces, and takes one of exactly its bound — S-22', () => {
    expect(
      refusalOf(() =>
        validateAnswers(both, 'allow', [answer('q1', [], '   '), answer('q2', ['Lint'])]),
      ),
    ).toEqual(['otherBlank@q1']);

    const longest = 'o'.repeat(QUESTION_LIMITS.other);
    expect(
      validateAnswers(both, 'allow', [answer('q1', [], longest), answer('q2', ['Lint'])]),
    ).toEqual([answer('q1', [], longest), answer('q2', ['Lint'])]);
    expect(
      refusalOf(() =>
        validateAnswers(both, 'allow', [answer('q1', [], `${longest}o`), answer('q2', ['Lint'])]),
      ),
    ).toEqual(['otherTooLong@q1']);
  });

  it('refuses an allow on a question nobody could read — S-23', () => {
    const malformed = normalizeQuestion({});

    expect(refusalOf(() => validateAnswers(malformed, 'allow', [answer('q1', ['A'])]))).toEqual([
      'malformed@-',
    ]);
    expect(refusalOf(() => validateAnswers(malformed, 'allow', null))).toEqual(['malformed@-']);
  });

  it('refuses the same label chosen twice', () => {
    expect(
      refusalOf(() =>
        validateAnswers(both, 'allow', [answer('q1', ['A']), answer('q2', ['Lint', 'Lint'])]),
      ),
    ).toEqual(['repeatedOption@q2']);
  });

  it('reports every broken rule at once, never one at a time', () => {
    expect(
      refusalOf(() =>
        validateAnswers(both, 'allow', [answer('q1', ['A', 'Z']), answer('q7', ['A'])]),
      ),
    ).toEqual(['unknownQuestion@q7', 'unknownOption@q1', 'singleChoice@q1', 'unanswered@q2']);
  });

  it('lets a refusal through with no answers — on a question, a malformed one, or any tool', () => {
    expect(validateAnswers(both, 'deny', null)).toBeNull();
    expect(validateAnswers(normalizeQuestion({}), 'deny', null)).toBeNull();
    expect(validateAnswers(null, 'deny', null)).toBeNull();
    expect(validateAnswers(null, 'allow', null)).toBeNull();
  });

  it('carries the code, the key and the details a client reads', () => {
    const refused = new PermissionAnswersInvalidError([
      { rule: 'answersRequired', questionId: null },
      { rule: 'unanswered', questionId: 'q2' },
    ]);

    expect(refused).toMatchObject({
      code: 'PERMISSION_ANSWERS_INVALID',
      messageKey: 'permission.error.answersInvalid',
      details: [
        { field: 'answers', rule: 'answersRequired' },
        { field: 'answers.q2', rule: 'unanswered' },
      ],
    });
    expect(refused.message).toBe('answers refused: answersRequired@-, unanswered@q2');
  });
});
