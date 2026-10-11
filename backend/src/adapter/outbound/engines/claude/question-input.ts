import { QUESTION_LIMITS } from '@domain/engine';
import type { Question, QuestionInteraction, QuestionOption } from '@domain/engine';
import { isRecord } from '@domain/shared';

/** What an input that cannot be read safely becomes: a question nobody can answer, only refuse. */
const MALFORMED: QuestionInteraction = { kind: 'question', malformed: true, questions: [] };

/**
 * The questions of an `AskUserQuestion`, as the product reads them — ids by position, texts cut to
 * their bounds, and `malformed` for whatever cannot be read safely (D-16).
 *
 * Malformed is no questions or more than four, fewer than two options or more than four, an option
 * with no label, a question with no options — the CLI's extended mode, whose open questions have
 * none (R-02) —, the same question twice, and the same label twice in one question. Every one of
 * them is something a screen could not offer, or an answer the SDK could not tell apart.
 *
 * Pure, and in the adapter: it reads the engine's input, which only the engine's adapter knows
 * (plan 28, B-21); the core gets the canonical interaction, and a client never reads the input
 * ([24 · D-02](../../../../../docs/plans/24-structured-questions/decisions.md)).
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
