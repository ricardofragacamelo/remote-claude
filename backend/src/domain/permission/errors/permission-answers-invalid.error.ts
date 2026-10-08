import { DomainError } from '@domain/shared';

/** Which rule an answer broke. */
export type AnswersRule =
  | 'answersRequired'
  | 'notAQuestion'
  | 'answersOnRefusal'
  | 'malformed'
  | 'unknownQuestion'
  | 'repeatedQuestion'
  | 'unanswered'
  | 'unknownOption'
  | 'repeatedOption'
  | 'singleChoice'
  | 'otherBlank'
  | 'otherTooLong';

/** One broken rule, and the question it was broken on — `null` when it is about the answer as a whole. */
export interface AnswersProblem {
  readonly rule: AnswersRule;
  readonly questionId: string | null;
}

/**
 * Answers that do not fit the question the server published.
 *
 * Refused before anything is settled, so the request stays open and the person can answer again —
 * and so Claude never receives an answer to a question it did not ask
 * ([plan 24](../../../../../docs/plans/24-structured-questions/README.md)). `422`: the payload has the
 * right shape, and its content does not fit what it answers.
 *
 * `details` says which rule and which question, **never** what was typed: a free answer is whatever
 * the person wrote, and an error envelope is logged.
 */
export class PermissionAnswersInvalidError extends DomainError {
  readonly code = 'PERMISSION_ANSWERS_INVALID';
  readonly messageKey = 'permission.error.answersInvalid';
  readonly details: readonly { readonly field: string; readonly rule: string }[];

  constructor(readonly problems: readonly AnswersProblem[]) {
    super(
      `answers refused: ${problems.map((problem) => `${problem.rule}@${problem.questionId ?? '-'}`).join(', ')}`,
    );
    this.details = problems.map((problem) => ({
      field: problem.questionId === null ? 'answers' : `answers.${problem.questionId}`,
      rule: problem.rule,
    }));
  }
}
