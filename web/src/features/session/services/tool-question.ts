import { readAnswers, readInteraction } from '@/features/permission';
import { isRecord, readText } from '@/shared/lib/json';
import type { QuestionOutcome, ToolQuestion } from '../types/live-session';

/** The three ends of a question the contract carries. */
const OUTCOMES = new Set<string>(['answered', 'declined', 'expired']);

/**
 * The question a `tool.completed` of an `AskUserQuestion` carries — the questions as the server
 * normalised them and, when it recorded them, how they ended (plan 24, B-22) — or `null` when it
 * carries none: any other tool, or an older server.
 *
 * Fails closed the way the card does: questions this build cannot read whole are read as unreadable,
 * never as half of what Claude asked.
 */
export function readToolQuestion(value: unknown): ToolQuestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const interaction = readInteraction(value['interaction']);

  if (interaction === null) {
    return null;
  }

  const outcome = readText(value, 'outcome');

  return {
    interaction,
    outcome: outcome !== null && OUTCOMES.has(outcome) ? (outcome as QuestionOutcome) : null,
    answers: readAnswers(value['answers']),
    reason: readText(value, 'reason'),
  };
}
