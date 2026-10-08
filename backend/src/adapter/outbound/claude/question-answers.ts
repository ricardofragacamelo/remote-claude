import { normalizeQuestion } from '@domain/permission';
import type { QuestionAnswer } from '@domain/permission';

/**
 * The input `canUseTool` hands back for an answered `AskUserQuestion`: the original, with the
 * answers in the shape the SDK reads.
 *
 * The SDK keys an answer by the **text** of the question, and takes the labels chosen joined by
 * `", "`, with the free answer in their place or after them. That string exists here and nowhere
 * else: on the wire an answer is the labels and the free answer apart, by the id of the question
 * (D-03), so a label containing `", "` or called "Other" is never ambiguous until this point.
 *
 * The labels a screen sent are the ones the server **showed**, which may have been cut; the SDK
 * needs the ones Claude wrote. The input is read again with the same normalisation that published
 * the question, and each label found by the position it shares with the original (S-49). The
 * `questions`, the `metadata` and everything else of the input go back as they came.
 */
export function withAnswers(
  input: Readonly<Record<string, unknown>>,
  answers: readonly QuestionAnswer[],
): Record<string, unknown> {
  const questions = new Map(
    normalizeQuestion(input).questions.map((question) => [question.id, question]),
  );
  const byPrompt: Record<string, string> = {};

  for (const answer of answers) {
    const question = questions.get(answer.questionId);

    if (question === undefined) {
      continue;
    }

    const labels = answer.selected.map(
      (label) => question.options.find((option) => option.label === label)?.originalLabel ?? label,
    );

    byPrompt[question.originalPrompt] = [
      ...labels,
      ...(answer.other === null ? [] : [answer.other]),
    ].join(', ');
  }

  return { ...input, answers: byPrompt };
}
