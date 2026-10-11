import { describe, expect, it } from 'vitest';
import {
  INTERACTION_LIMITS,
  INTERACTION_QUESTIONS_ITEM_LIMITS,
  INTERACTION_QUESTIONS_ITEM_OPTIONS_ITEM_LIMITS,
  QUESTION_ANSWER_LIMITS,
} from '@remote-claude/contracts';

import { normalizeQuestion } from '@adapter/outbound/engines/claude/question-input';
import {
  PermissionAnswersInvalidError,
  QUESTION_LIMITS,
  validateAnswers,
} from '@domain/permission';
import type { PlanInteraction, QuestionAnswer, QuestionInteraction } from '@domain/permission';

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

describe('the bounds of the domain are the contract`s', () => {
  it('reads the same numbers the generated contract declares', () => {
    // Written twice — the domain may not import the contract — and tied here, so they cannot drift.
    expect(QUESTION_LIMITS.questions).toBe(INTERACTION_LIMITS.questions.maxItems);
    expect(QUESTION_LIMITS.header).toBe(INTERACTION_QUESTIONS_ITEM_LIMITS.header.maxLength);
    expect(QUESTION_LIMITS.prompt).toBe(INTERACTION_QUESTIONS_ITEM_LIMITS.prompt.maxLength);
    expect(QUESTION_LIMITS.optionsMin).toBe(INTERACTION_QUESTIONS_ITEM_LIMITS.options.minItems);
    expect(QUESTION_LIMITS.optionsMax).toBe(INTERACTION_QUESTIONS_ITEM_LIMITS.options.maxItems);
    expect(QUESTION_LIMITS.label).toBe(
      INTERACTION_QUESTIONS_ITEM_OPTIONS_ITEM_LIMITS.label.maxLength,
    );
    expect(QUESTION_LIMITS.description).toBe(
      INTERACTION_QUESTIONS_ITEM_OPTIONS_ITEM_LIMITS.description.maxLength,
    );
    expect(QUESTION_LIMITS.preview).toBe(
      INTERACTION_QUESTIONS_ITEM_OPTIONS_ITEM_LIMITS.preview.maxLength,
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

  it('answers a plan with nothing: approved or refused, never with answers — S-61', () => {
    const plan: PlanInteraction = { kind: 'plan', markdown: '# Plan', path: null };

    expect(validateAnswers(plan, 'allow', null)).toBeNull();
    expect(validateAnswers(plan, 'deny', null)).toBeNull();
    expect(refusalOf(() => validateAnswers(plan, 'allow', [answer('q1', ['A'])]))).toEqual([
      'notAQuestion@-',
    ]);
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
