import type { UserId } from '@domain/auth';
import { isRecord } from '@domain/shared';
import type { TranscriptEvent, TranscriptMessage } from '@domain/transcript';
import type { QuestionRecord, QuestionRecordSource } from '@application/permission';

/**
 * The questions of the agent in the history of a session, with how they ended (plan 24, B-21).
 *
 * The transcript keeps the questions — the adapter reads them into the `interaction` of the
 * `tool.started` (plan 28, B-21) — and only the text the engine made of the answers, a format nobody
 * documents (D-13). What was answered comes from what this backend recorded when it was answered,
 * joined by the tool call: a `tool.completed` of a `question` gains its `question` — the questions normalised as the request carried them, and, when there is a
 * record, the outcome, the answers and the reason. A question answered in another client has no
 * record, and goes with its questions alone.
 *
 * The same path for a page read and for the follower (D-27), so a reopened session and one followed
 * live draw the same line.
 */
export class QuestionHistory {
  constructor(private readonly records: QuestionRecordSource) {}

  /**
   * `page`, its questions joined to how they ended.
   *
   * @param conversation every message of the conversation — where each question was asked,
   *   which may sit on an earlier page than its completion
   */
  async of(
    userId: UserId,
    page: readonly TranscriptMessage[],
    conversation: readonly TranscriptMessage[],
  ): Promise<readonly TranscriptMessage[]> {
    const asked = questionsAsked(conversation);
    const answered = completedIn(page).filter((toolUseId) => asked.has(toolUseId));

    if (answered.length === 0) {
      return page;
    }

    const records = await this.records.recordsOf(userId, answered);

    return page.map((message) => ({
      ...message,
      events: message.events.map((event) => withQuestion(event, asked, records)),
    }));
  }
}

/** The questions every question call of a conversation asked, by its tool call (plan 28, B-21). */
function questionsAsked(
  conversation: readonly TranscriptMessage[],
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  const asked = new Map<string, Readonly<Record<string, unknown>>>();

  for (const event of conversation.flatMap((message) => message.events)) {
    const { toolUseId, kind, interaction } = event.payload;

    if (
      event.type === 'tool.started' &&
      kind === 'question' &&
      typeof toolUseId === 'string' &&
      isRecord(interaction)
    ) {
      asked.set(toolUseId, interaction);
    }
  }

  return asked;
}

/** The tool calls a page says ended. */
function completedIn(page: readonly TranscriptMessage[]): string[] {
  return page.flatMap((message) =>
    message.events.flatMap((event) => {
      const toolUseId = event.payload['toolUseId'];
      return event.type === 'tool.completed' && typeof toolUseId === 'string' ? [toolUseId] : [];
    }),
  );
}

/** An event with its question, when it is the end of one. */
function withQuestion(
  event: TranscriptEvent,
  asked: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  records: ReadonlyMap<string, QuestionRecord>,
): TranscriptEvent {
  const toolUseId = String(event.payload['toolUseId']);
  const interaction = event.type === 'tool.completed' ? asked.get(toolUseId) : undefined;

  if (interaction === undefined) {
    return event;
  }

  return {
    ...event,
    payload: {
      ...event.payload,
      question: {
        interaction,
        ...endOf(records.get(toolUseId)),
      },
    },
  };
}

/** How a question ended, as the contract's `question` says it — nothing, with no record or still open. */
function endOf(record: QuestionRecord | undefined): Readonly<Record<string, unknown>> {
  if (record === undefined || record.status === 'pending') {
    return {};
  }

  if (record.status === 'expired') {
    return { outcome: 'expired' };
  }

  return record.decision === 'allow'
    ? { outcome: 'answered', ...(Array.isArray(record.answers) ? { answers: record.answers } : {}) }
    : { outcome: 'declined', ...(record.reason === null ? {} : { reason: record.reason }) };
}
