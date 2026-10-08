/**
 * The tool with which Claude stops and asks the person something.
 *
 * It is a permission request like any other — same id, same deadline, same "first answer wins" —
 * and it carries an {@link QuestionInteraction} instead of asking leave to run anything
 * ([plan 24](../../../../../docs/plans/24-structured-questions/README.md)).
 */
export const QUESTION_TOOL = 'AskUserQuestion';

/**
 * How long each text of a question may be, and how many of each thing there may be.
 *
 * The same numbers as the contract's `QuestionInteraction` and `QuestionAnswer` — a unit test reads
 * the generated limits and compares them, so the two cannot drift. A text past its bound is **cut**,
 * never refused: it is Claude's, and the question has to reach somebody.
 */
export const QUESTION_LIMITS = {
  questions: 4,
  optionsMin: 2,
  optionsMax: 4,
  header: 60,
  prompt: 2_000,
  label: 200,
  description: 1_000,
  preview: 20_000,
  other: 2_000,
} as const;

/** One option of a question, as a screen shows it. */
export interface QuestionOption {
  /** Shown, and answered, exactly as it is here — cut to its bound, never otherwise changed. */
  readonly label: string;
  readonly description: string;

  /** Markdown, rendered safely; `null` when the option has none. */
  readonly preview: string | null;

  /**
   * The label as Claude wrote it, before any cut.
   *
   * Never on the wire: it is what the SDK expects back, and the only way to find it from a label a
   * screen sent is by the position the two share (S-49).
   */
  readonly originalLabel: string;
}

/** One question, normalised. */
export interface Question {
  /** `q1`…`q4`, by position — stable within the request, and what an answer names. */
  readonly id: string;
  readonly header: string;
  readonly prompt: string;

  /** The question as Claude wrote it: the key the SDK's `answers` are given under. Never on the wire. */
  readonly originalPrompt: string;
  readonly multiSelect: boolean;
  readonly options: readonly QuestionOption[];
}

/**
 * The questions of an `AskUserQuestion`, as the product reads them.
 *
 * `malformed` is the honest outcome for an input that cannot be read safely: the screen offers only a
 * refusal, and an `allow` is refused (D-16). Its `questions` are then empty — showing half of what
 * Claude asked would invite an answer to a question it did not ask.
 */
export interface QuestionInteraction {
  readonly kind: 'question';
  readonly malformed: boolean;
  readonly questions: readonly Question[];
}

/**
 * What a person answered to one question: the labels chosen and the free answer ("Other"), apart.
 *
 * Never the SDK's string joined by `", "` — that exists only in the adapter, where a label that
 * contains `", "` or is called "Other" can no longer be told from anything else (D-03).
 */
export interface QuestionAnswer {
  readonly questionId: string;
  readonly selected: readonly string[];

  /** The free answer, trimmed; `null` when there is none. */
  readonly other: string | null;
}
