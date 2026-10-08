/**
 * How the fixture recorder answers a question of Claude, and what it requires of one.
 *
 * The recorder used to answer `canUseTool` with the input it was given — for `AskUserQuestion` that
 * is an answer to nothing, and the CLI told the model "The user did not answer the questions."
 * The recording then held a conversation the product can no longer have (plan 24, B-11). Now it
 * answers the way the backend does: the `updatedInput` with `answers`, keyed by the text of each
 * question — the first option of each, so a recording is reproducible.
 */

/** The tool with which Claude asks. */
export const QUESTION_TOOL = 'AskUserQuestion';

/**
 * @typedef {{ question?: unknown, multiSelect?: unknown, options?: unknown }} SdkQuestion
 * @typedef {{ label?: unknown, preview?: unknown }} SdkOption
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The questions of an input, as far as they can be read.
 *
 * @param {unknown} input
 * @returns {SdkQuestion[]}
 */
function questionsOf(input) {
  const questions = isRecord(input) ? input['questions'] : undefined;
  return Array.isArray(questions) ? questions.filter(isRecord) : [];
}

/**
 * The options of a question.
 *
 * @param {SdkQuestion} question
 * @returns {SdkOption[]}
 */
function optionsOf(question) {
  return Array.isArray(question.options) ? question.options.filter(isRecord) : [];
}

/**
 * The input `canUseTool` hands back for a question: the one it was given, with the first option of
 * every question as the answer — the shape the SDK reads (`{ [question]: label }`).
 *
 * @param {Record<string, unknown>} input
 * @returns {Record<string, unknown>}
 */
export function answeredWithFirstOptions(input) {
  /** @type {Record<string, string>} */
  const answers = {};

  for (const question of questionsOf(input)) {
    const label = optionsOf(question)[0]?.label;

    if (typeof question.question === 'string' && typeof label === 'string') {
      answers[question.question] = label;
    }
  }

  return { ...input, answers };
}

/**
 * What a recording of questions lacks — empty when it has everything a test of the card needs: one
 * call with two questions or more, one of them of multiple choice and one with a preview (plan 24,
 * B-11, R-04).
 *
 * A model that did not cooperate fails the recording, loudly, rather than leaving behind a fixture
 * that proves less than the tests built on it claim.
 *
 * @param {readonly { toolName: string, input: unknown }[]} consulted what `canUseTool` was asked
 * @returns {string[]}
 */
export function questionTurnProblems(consulted) {
  const calls = consulted.filter((entry) => entry.toolName === QUESTION_TOOL);

  if (calls.length === 0) {
    return ['Claude asked no question'];
  }

  const best = calls
    .map((entry) => questionsOf(entry.input))
    .reduce((most, questions) => (questions.length > most.length ? questions : most), []);

  return [
    best.length < 2 && `one call asked ${String(best.length)} question(s), not two or more`,
    !best.some((question) => question.multiSelect === true) && 'no question was of multiple choice',
    !best.some((question) =>
      optionsOf(question).some(
        (option) => typeof option.preview === 'string' && option.preview !== '',
      ),
    ) && 'no option had a preview',
  ].filter((problem) => typeof problem === 'string');
}

/**
 * What a recording that must hold a question and a plan lacks — the plan turn, whose replay the
 * panel's e2e answers question first, plan second.
 *
 * @param {readonly { toolName: string }[]} consulted
 * @returns {string[]}
 */
export function planTurnProblems(consulted) {
  const asked = new Set(consulted.map((entry) => entry.toolName));

  return [
    !asked.has(QUESTION_TOOL) && 'Claude asked no question before the plan',
    !asked.has('ExitPlanMode') && 'Claude presented no plan',
  ].filter((problem) => typeof problem === 'string');
}
