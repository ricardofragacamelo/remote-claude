import type {
  Question,
  QuestionAnswer,
  QuestionDraft,
  QuestionInteraction,
} from '../types/permission';

/** Nothing chosen yet, on the first question. */
export const EMPTY_DRAFT: QuestionDraft = { step: 0, selected: {}, other: {} };

/** The labels chosen on a question. */
export function chosenOf(draft: QuestionDraft, question: Question): readonly string[] {
  return draft.selected[question.id] ?? [];
}

/** The free answer of a question: its text when "Other" is marked — `''` while empty —, `null` when not. */
export function otherOf(draft: QuestionDraft, question: Question): string | null {
  return draft.other[question.id] ?? null;
}

/**
 * The draft after a label is chosen: a single choice takes it **instead** of whatever was chosen —
 * the free answer included —, a multiple one toggles it beside the others.
 */
export function choose(draft: QuestionDraft, question: Question, label: string): QuestionDraft {
  const current = chosenOf(draft, question);

  if (question.multiSelect) {
    const selected = current.includes(label)
      ? current.filter((chosen) => chosen !== label)
      : [...current, label];

    return { ...draft, selected: { ...draft.selected, [question.id]: selected } };
  }

  return {
    ...draft,
    selected: { ...draft.selected, [question.id]: [label] },
    other: { ...draft.other, [question.id]: null },
  };
}

/**
 * The draft after "Other" is marked or unmarked. Marked, it starts empty — and on a single choice
 * it is the choice, so the labels go.
 */
export function toggleOther(draft: QuestionDraft, question: Question): QuestionDraft {
  if (otherOf(draft, question) !== null) {
    return { ...draft, other: { ...draft.other, [question.id]: null } };
  }

  return {
    ...draft,
    other: { ...draft.other, [question.id]: '' },
    selected: question.multiSelect ? draft.selected : { ...draft.selected, [question.id]: [] },
  };
}

/** The draft with what is typed as the free answer. */
export function writeOther(draft: QuestionDraft, question: Question, text: string): QuestionDraft {
  return { ...draft, other: { ...draft.other, [question.id]: text } };
}

/** The draft on another question. */
export function onStep(draft: QuestionDraft, step: number): QuestionDraft {
  return { ...draft, step };
}

/** A free answer worth sending: marked, and not blank. */
function filledOther(draft: QuestionDraft, question: Question): string | null {
  const other = otherOf(draft, question)?.trim() ?? '';
  return other === '' ? null : other;
}

/**
 * Whether a question has an answer: a label, or a free answer with something in it. "Other" marked
 * and left empty is no answer (plan 24, S-66).
 */
export function isAnswered(draft: QuestionDraft, question: Question): boolean {
  return chosenOf(draft, question).length > 0 || filledOther(draft, question) !== null;
}

/** Whether every question has an answer — what "Send answers" waits for (D-04). */
export function allAnswered(interaction: QuestionInteraction, draft: QuestionDraft): boolean {
  return interaction.questions.every((question) => isAnswered(draft, question));
}

/** The answers to send: by question, the labels and the free answer apart, trimmed. */
export function answersOf(
  interaction: QuestionInteraction,
  draft: QuestionDraft,
): readonly QuestionAnswer[] {
  return interaction.questions.map((question) => ({
    questionId: question.id,
    selected: [...chosenOf(draft, question)],
    other: filledOther(draft, question),
  }));
}

/** The option Claude recommends — its label ends in "(Recommended)". Highlighted, never pre-chosen. */
export function isRecommended(label: string): boolean {
  return /\(recommended\)\s*$/i.test(label);
}
