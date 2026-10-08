import { isRecord } from '@domain/shared';
import type { PermissionDecision } from '../entities/permission-request.entity';
import { PermissionAnswersInvalidError } from '../errors/permission-answers-invalid.error';
import type { AnswersProblem } from '../errors/permission-answers-invalid.error';
import { QUESTION_LIMITS, QUESTION_TOOL } from '../value-objects/question.value-object';
import type {
  Question,
  QuestionAnswer,
  QuestionInteraction,
  QuestionOption,
} from '../value-objects/question.value-object';

/** What an input that cannot be read safely becomes: a question nobody can answer, only refuse. */
const MALFORMED: QuestionInteraction = { kind: 'question', malformed: true, questions: [] };

/** The interaction a request carries: the questions of an `AskUserQuestion`, `null` for any other tool. */
export function interactionFor(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
): QuestionInteraction | null {
  return toolName === QUESTION_TOOL ? normalizeQuestion(input) : null;
}

/**
 * The questions of an `AskUserQuestion`, as the product reads them — ids by position, texts cut to
 * their bounds, and `malformed` for whatever cannot be read safely (D-16).
 *
 * Malformed is no questions or more than four, fewer than two options or more than four, an option
 * with no label, a question with no options — the CLI's extended mode, whose open questions have
 * none (R-02) —, the same question twice, and the same label twice in one question. Every one of
 * them is something a screen could not offer, or an answer the SDK could not tell apart.
 *
 * Pure, and in the domain: it is the half of the contract the server owns, and a client never reads
 * the SDK's input ([D-02](../../../../../docs/plans/24-structured-questions/decisions.md)).
 */
export function normalizeQuestion(input: Readonly<Record<string, unknown>>): QuestionInteraction {
  const raw = input['questions'];

  if (!Array.isArray(raw) || raw.length === 0 || raw.length > QUESTION_LIMITS.questions) {
    return MALFORMED;
  }

  const questions = allRead(raw.map(readQuestion));

  if (questions === null || repeats(questions.map((question) => question.prompt))) {
    return MALFORMED;
  }

  return { kind: 'question', malformed: false, questions };
}

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
  interaction: QuestionInteraction | null,
  decision: PermissionDecision,
  answers: readonly QuestionAnswer[] | null,
): readonly QuestionAnswer[] | null {
  const problems = problemsOf(interaction, decision, answers);

  if (problems.length > 0) {
    throw new PermissionAnswersInvalidError(problems);
  }

  return interaction === null || answers === null ? null : inOrder(interaction, answers);
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
    // Claude is never handed a "yes" that answers nothing (S-23).
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

/** One entry of the SDK's `questions`, or `null` when it cannot be read safely. */
function readQuestion(entry: unknown, index: number): Question | null {
  if (!isRecord(entry)) {
    return null;
  }

  const prompt = entry['question'];
  const options = readOptions(entry['options']);

  if (typeof prompt !== 'string' || prompt.trim() === '' || options === null) {
    return null;
  }

  return {
    id: `q${String(index + 1)}`,
    header: cut(textOf(entry['header']), QUESTION_LIMITS.header),
    prompt: cut(prompt, QUESTION_LIMITS.prompt),
    originalPrompt: prompt,
    multiSelect: entry['multiSelect'] === true,
    options,
  };
}

/** The options of one question, or `null` when they cannot be offered as they are. */
function readOptions(raw: unknown): QuestionOption[] | null {
  if (
    !Array.isArray(raw) ||
    raw.length < QUESTION_LIMITS.optionsMin ||
    raw.length > QUESTION_LIMITS.optionsMax
  ) {
    return null;
  }

  const options = allRead(raw.map(readOption));

  // Compared as they are shown: two labels that differ only past the cut would be one answer.
  return options !== null && !repeats(options.map((option) => option.label)) ? options : null;
}

/** One option, or `null` when it has no label to answer with. */
function readOption(entry: unknown): QuestionOption | null {
  if (!isRecord(entry)) {
    return null;
  }

  const label = entry['label'];
  if (typeof label !== 'string' || label.trim() === '') {
    return null;
  }

  const preview = textOf(entry['preview']);

  return {
    label: cut(label, QUESTION_LIMITS.label),
    description: cut(textOf(entry['description']), QUESTION_LIMITS.description),
    preview: preview.trim() === '' ? null : cut(preview, QUESTION_LIMITS.preview),
    originalLabel: label,
  };
}

/**
 * `text`, at most `limit` characters long, ending in `…` when it was cut.
 *
 * Cut and not refused: the text is Claude's, and the question has to reach somebody. Never in the
 * middle of a surrogate pair, which would leave half a character a screen draws as a box.
 */
function cut(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  const end = isHighSurrogate(text.charCodeAt(limit - 2)) ? limit - 2 : limit - 1;
  return `${text.slice(0, end)}…`;
}

/** The first half of a character outside the basic plane. */
function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** A string field, or nothing. */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Every entry, when every one was read — `null` when any was not. */
function allRead<T>(entries: readonly (T | null)[]): T[] | null {
  const read = entries.filter((entry): entry is T => entry !== null);
  return read.length === entries.length ? read : null;
}

/** Whether any value appears twice. */
function repeats(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}
