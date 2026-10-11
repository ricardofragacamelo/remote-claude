import { QUESTION_LIMITS } from '@domain/engine';
import type { Interaction, Question, QuestionAnswer, QuestionInteraction } from '@domain/engine';
import type { PermissionDecision } from '../entities/permission-request.entity';
import { PermissionAnswersInvalidError } from '../errors/permission-answers-invalid.error';
import type { AnswersProblem } from '../errors/permission-answers-invalid.error';

/**
 * Checks answers against the questions the server published, and returns them in the order of the
 * questions — the free answer trimmed.
 *
 * Every rule is checked and every broken one is reported, by rule and question and never with what
 * was typed: a person told one mistake at a time sends three times. Toda pergunta é obrigatória
 * ([D-04](../../../../../docs/plans/24-structured-questions/decisions.md)).
 *
 * It is the validation an automatic answerer will use too, which is why it lives here and not in a
 * handler ([workflow §13.2](../../../../../docs/discovery/02-workflow-de-sessoes.md)).
 *
 * @returns the answers to hand on, or `null` when there are none to hand on
 * @throws {PermissionAnswersInvalidError} when any rule is broken
 */
export function validateAnswers(
  interaction: Interaction | null,
  decision: PermissionDecision,
  answers: readonly QuestionAnswer[] | null,
): readonly QuestionAnswer[] | null {
  // A plan is approved or refused, and answered with nothing: only a question takes answers.
  const question = interaction?.kind === 'question' ? interaction : null;
  const problems = problemsOf(question, decision, answers);

  if (problems.length > 0) {
    throw new PermissionAnswersInvalidError(problems);
  }

  return question === null || answers === null ? null : inOrder(question, answers);
}

/** What is wrong with an answer as a whole, before any question is looked at. */
function problemsOf(
  interaction: QuestionInteraction | null,
  decision: PermissionDecision,
  answers: readonly QuestionAnswer[] | null,
): readonly AnswersProblem[] {
  if (interaction === null || decision === 'deny') {
    // Answers belong to a question that is being answered: never to a tool asking leave, never to
    // a refusal, which says why in its reason.
    return answers === null
      ? []
      : [{ rule: interaction === null ? 'notAQuestion' : 'answersOnRefusal', questionId: null }];
  }

  if (interaction.malformed) {
    return [{ rule: 'malformed', questionId: null }];
  }

  if (answers === null) {
    // What an old client sends from the generic card: an `allow` with nothing in it. Refused, so
    // the agent is never handed a "yes" that answers nothing (S-23).
    return [{ rule: 'answersRequired', questionId: null }];
  }

  return [
    ...strangers(interaction, answers),
    ...interaction.questions.flatMap((question) => problemsOfQuestion(question, answers)),
  ];
}

/** Answers to a question that does not exist, and a second answer to one that does. */
function strangers(
  interaction: QuestionInteraction,
  answers: readonly QuestionAnswer[],
): readonly AnswersProblem[] {
  const known = new Set(interaction.questions.map((question) => question.id));
  const seen = new Set<string>();

  return answers.flatMap((answer): AnswersProblem[] => {
    if (!known.has(answer.questionId)) {
      return [{ rule: 'unknownQuestion', questionId: answer.questionId }];
    }

    if (seen.has(answer.questionId)) {
      return [{ rule: 'repeatedQuestion', questionId: answer.questionId }];
    }

    seen.add(answer.questionId);
    return [];
  });
}

/** What is wrong with the answer to one question — or that there is none. */
function problemsOfQuestion(
  question: Question,
  answers: readonly QuestionAnswer[],
): readonly AnswersProblem[] {
  const answer = answers.find((candidate) => candidate.questionId === question.id);

  if (answer === undefined || (answer.selected.length === 0 && answer.other === null)) {
    return [{ rule: 'unanswered', questionId: question.id }];
  }

  const labels = new Set(question.options.map((option) => option.label));
  const broken = [
    answer.selected.some((label) => !labels.has(label)) && 'unknownOption',
    repeats(answer.selected) && 'repeatedOption',
    ...otherProblems(answer.other),
    !question.multiSelect && choices(answer) > 1 && 'singleChoice',
  ].filter((rule): rule is AnswersProblem['rule'] => rule !== false);

  return broken.map((rule) => ({ rule, questionId: question.id }));
}

/** A free answer that is blank, or past its bound. */
function otherProblems(other: string | null): readonly (AnswersProblem['rule'] | false)[] {
  if (other === null) {
    return [];
  }

  return [
    other.trim() === '' && 'otherBlank',
    other.length > QUESTION_LIMITS.other && 'otherTooLong',
  ];
}

/** How many things were chosen: the labels, and the free answer when there is one. */
function choices(answer: QuestionAnswer): number {
  return answer.selected.length + (answer.other === null ? 0 : 1);
}

/** The answers in the order of the questions, each free answer trimmed. */
function inOrder(
  interaction: QuestionInteraction,
  answers: readonly QuestionAnswer[],
): readonly QuestionAnswer[] {
  return interaction.questions.flatMap((question) => {
    const answer = answers.find((candidate) => candidate.questionId === question.id);

    return answer === undefined
      ? []
      : [
          {
            questionId: question.id,
            selected: [...answer.selected],
            other: answer.other === null ? null : answer.other.trim(),
          },
        ];
  });
}

/** Whether any value appears twice. */
function repeats(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}
