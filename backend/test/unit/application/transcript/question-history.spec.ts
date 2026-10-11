import { describe, expect, it } from 'vitest';

import type { QuestionRecord, QuestionRecordSource } from '@application/permission';
import { QuestionHistory } from '@application/transcript/question-history';
import { UserId } from '@domain/auth';
import type { TranscriptMessage } from '@domain/transcript';
import { canonicalToolPayload } from '@application/session';
import { claudeTool } from '../../../support/builders/tool.builder';

const owner = UserId.create('auth|owner');

/** The input of an `AskUserQuestion`, as the transcript keeps it. */
const INPUT = {
  questions: [
    {
      question: 'Which library?',
      header: 'Library',
      multiSelect: false,
      options: [
        { label: 'date-fns', description: '' },
        { label: 'luxon', description: '' },
      ],
    },
  ],
};

/** A conversation: the question asked on one message, ended on the next, and a shell call. */
const ASKED: TranscriptMessage = {
  id: 'm1',
  events: [
    {
      type: 'tool.started',
      payload: {
        toolUseId: 'q-1',
        ...canonicalToolPayload(claudeTool('AskUserQuestion', INPUT), INPUT),
      },
    },
    {
      type: 'tool.started',
      payload: {
        toolUseId: 'b-1',
        ...canonicalToolPayload(claudeTool('Bash', { command: 'ls' }), { command: 'ls' }),
      },
    },
  ],
};
const ENDED: TranscriptMessage = {
  id: 'm2',
  events: [
    {
      type: 'tool.completed',
      payload: { toolUseId: 'q-1', status: 'succeeded', summary: 'Your questions…' },
    },
    { type: 'tool.completed', payload: { toolUseId: 'b-1', status: 'succeeded' } },
  ],
};

/** A source that answers what a test says, and records what it was asked. */
function records(known: Record<string, QuestionRecord> = {}) {
  const asked: { userId: string; toolUseIds: readonly string[] }[] = [];
  const source: QuestionRecordSource = {
    recordsOf: (userId, toolUseIds) => {
      asked.push({ userId: userId.value, toolUseIds });
      return Promise.resolve(
        new Map(Object.entries(known).filter(([toolUseId]) => toolUseIds.includes(toolUseId))),
      );
    },
  };
  return { source, asked };
}

/** The `question` the end of `q-1` carries, after a page is joined. */
async function questionOf(record?: QuestionRecord): Promise<unknown> {
  const { source } = records(record === undefined ? {} : { 'q-1': record });
  const [, ended] = await new QuestionHistory(source).of(owner, [ASKED, ENDED], [ASKED, ENDED]);
  return ended?.events[0]?.payload['question'];
}

const INTERACTION = {
  kind: 'question',
  malformed: false,
  questions: [
    {
      id: 'q1',
      header: 'Library',
      prompt: 'Which library?',
      multiSelect: false,
      options: [
        { label: 'date-fns', description: '' },
        { label: 'luxon', description: '' },
      ],
    },
  ],
};

describe('the questions of a history — plan 24, B-21', () => {
  it('joins what was answered here to the end of its question, by the tool call — S-98', async () => {
    expect(
      await questionOf({
        status: 'resolved',
        decision: 'allow',
        reason: null,
        answers: [{ questionId: 'q1', selected: ['luxon'] }],
      }),
    ).toEqual({
      interaction: INTERACTION,
      outcome: 'answered',
      answers: [{ questionId: 'q1', selected: ['luxon'] }],
    });
  });

  it('gives a question answered elsewhere its questions alone, and says nothing more — S-99', async () => {
    expect(await questionOf()).toEqual({ interaction: INTERACTION });
  });

  it('says a refused question was refused, with why, and one out of time ran out — S-101', async () => {
    expect(
      await questionOf({ status: 'resolved', decision: 'deny', reason: 'not now', answers: null }),
    ).toEqual({ interaction: INTERACTION, outcome: 'declined', reason: 'not now' });
    expect(
      await questionOf({ status: 'resolved', decision: 'deny', reason: null, answers: null }),
    ).toEqual({ interaction: INTERACTION, outcome: 'declined' });
    expect(
      await questionOf({ status: 'expired', decision: 'deny', reason: null, answers: null }),
    ).toEqual({ interaction: INTERACTION, outcome: 'expired' });
  });

  it('says nothing of how a question still open ends, nor of answers it did not keep', async () => {
    expect(
      await questionOf({ status: 'pending', decision: null, reason: null, answers: null }),
    ).toEqual({ interaction: INTERACTION });
    expect(
      await questionOf({ status: 'resolved', decision: 'allow', reason: null, answers: null }),
    ).toEqual({ interaction: INTERACTION, outcome: 'answered' });
  });

  it('reads the question on an earlier page than its end, and asks only for what ended here', async () => {
    const { source, asked } = records();

    const [ended] = await new QuestionHistory(source).of(owner, [ENDED], [ASKED, ENDED]);

    expect(ended?.events[0]?.payload['question']).toEqual({ interaction: INTERACTION });
    expect(ended?.events[1]?.payload).not.toHaveProperty('question');
    expect(asked).toEqual([{ userId: 'auth|owner', toolUseIds: ['q-1'] }]);
  });

  it('asks nothing, and hands the page back as it was, when no question ended on it', async () => {
    const { source, asked } = records();
    const page = [ASKED];

    expect(await new QuestionHistory(source).of(owner, page, [ASKED, ENDED])).toBe(page);
    expect(asked).toEqual([]);
  });

  it('leaves alone a question whose start it never saw, and an input that is not an object', async () => {
    const { source } = records();
    const odd: TranscriptMessage = {
      id: 'm0',
      events: [
        {
          type: 'tool.started',
          payload: { toolUseId: 'q-2', kind: 'question', rawInput: 'x' },
        },
        { type: 'tool.completed', payload: { toolUseId: 7 } },
      ],
    };

    expect(await new QuestionHistory(source).of(owner, [odd, ENDED], [odd, ENDED])).toEqual([
      odd,
      ENDED,
    ]);
  });

  it('reads a question by its kind and its interaction, whichever engine asked it — plan 28, B-15, S-64', async () => {
    const { source } = records();
    const asked: TranscriptMessage = {
      id: 'm1',
      events: [
        {
          type: 'tool.started',
          payload: {
            toolUseId: 'q-1',
            kind: 'question',
            origin: { engine: 'test-engine', native: 'ask_user' },
            rawInput: { anything: 'the engine of its own' },
            interaction: INTERACTION,
          },
        },
      ],
    };

    const [, ended] = await new QuestionHistory(source).of(owner, [asked, ENDED], [asked, ENDED]);

    expect(ended?.events[0]?.payload['question']).toEqual({ interaction: INTERACTION });
  });

  it('never rebuilds a question from the raw input: a start with no interaction asks nothing — S-64', async () => {
    const { source, asked } = records();
    const raw: TranscriptMessage = {
      id: 'm1',
      events: [
        {
          type: 'tool.started',
          payload: {
            toolUseId: 'q-1',
            kind: 'question',
            origin: { engine: 'claude', native: 'AskUserQuestion' },
            rawInput: INPUT,
          },
        },
      ],
    };

    const page = [raw, ENDED];
    expect(await new QuestionHistory(source).of(owner, page, page)).toBe(page);
    expect(asked).toEqual([]);
  });

  it('joins nothing to the end of a plan, which is not a question', async () => {
    const { source, asked } = records();
    const input = { plan: '# Plan' };
    const plan: TranscriptMessage = {
      id: 'm1',
      events: [
        {
          type: 'tool.started',
          payload: {
            toolUseId: 'q-1',
            ...canonicalToolPayload(claudeTool('ExitPlanMode', input), input),
          },
        },
      ],
    };

    const page = [plan, ENDED];
    expect(await new QuestionHistory(source).of(owner, page, page)).toBe(page);
    expect(asked).toEqual([]);
  });

  it('never reads a question by the engine`s name of the tool alone', async () => {
    // The name of Claude's question tool, on a call whose kind is not `question`: not a question.
    const { source, asked } = records();
    const named: TranscriptMessage = {
      id: 'm1',
      events: [
        {
          type: 'tool.started',
          payload: {
            toolUseId: 'q-1',
            kind: 'other',
            origin: { engine: 'claude', native: 'AskUserQuestion' },
            rawInput: INPUT,
          },
        },
      ],
    };

    const page = [named, ENDED];
    expect(await new QuestionHistory(source).of(owner, page, page)).toBe(page);
    expect(asked).toEqual([]);
  });
});
