import type {
  PermissionOutcome,
  QuestionAnswer,
  QuestionEnd,
  QuestionInteraction,
} from '@/features/permission';
import type { ToolExecution } from '../../types/live-session';

/** A question of Claude on the line of its tool: the questions, what was answered, and how it ended. */
export interface QuestionView {
  readonly interaction: QuestionInteraction;
  readonly answers: readonly QuestionAnswer[] | null;
  readonly end: QuestionEnd;

  /** Why it was refused, on `declined` — what Claude was told. */
  readonly reason: string | null;

  /** What the CLI said of it. */
  readonly summary: string | null;
}

/**
 * The question on the line of an `AskUserQuestion`, as far as this screen knows it — or `null`, and
 * the line is drawn like any other (plan 24, B-15).
 *
 * Live, the settlement of its request carries the questions — they were the card's — and the answers
 * of `permission.resolved`; a refusal's reason is what the tool said, which is what Claude was told.
 * From the history, `tool.completed` carries them, with what this backend recorded (plan 24, B-22) —
 * and a question it has no record of, answered in another client, says so.
 */
export function questionOf(
  tool: ToolExecution,
  outcome: PermissionOutcome | undefined,
): QuestionView | null {
  if (tool.toolName !== 'AskUserQuestion') {
    return null;
  }

  if (outcome?.interaction != null) {
    const end = endOf(outcome);

    return {
      interaction: outcome.interaction,
      answers: outcome.answers,
      end,
      reason: end === 'declined' ? tool.summary : null,
      summary: tool.summary,
    };
  }

  return recordedOf(tool);
}

/** The question as the history carries it, or `null` when it carries none. */
function recordedOf(tool: ToolExecution): QuestionView | null {
  const recorded = tool.question;

  if (recorded === undefined) {
    return null;
  }

  const end = recorded.outcome ?? 'unknown';

  return {
    interaction: recorded.interaction,
    answers: recorded.answers,
    end,
    reason: end === 'declined' ? (recorded.reason ?? tool.summary) : null,
    summary: tool.summary,
  };
}

/** How it ended: answered; refused by the deadline, which is nobody's; or refused by somebody. */
function endOf(outcome: PermissionOutcome): QuestionEnd {
  if (outcome.decision === 'allow') {
    return 'answered';
  }

  return outcome.auto && outcome.resolvedBy === null ? 'expired' : 'declined';
}
