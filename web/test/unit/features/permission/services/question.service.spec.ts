import { describe, expect, it } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import {
  readAnswers,
  readInteraction,
  sendAnswer,
  toOutcome,
  toRequest,
} from '@/features/permission/services/permission.service';
import type { WsClient } from '@/shared/api/ws-client';
import { QUESTIONS, aQuestionPayload, anInteraction } from '../../../../support/question';

function frame(type: string, payload: Record<string, unknown>): Envelope {
  return {
    v: 1,
    id: 'frame-q',
    kind: type === 'permission.requested' ? 'request' : 'event',
    type,
    ts: '2026-10-08T12:00:00.000Z',
    payload,
  } as Envelope;
}

const asked = (overrides: Record<string, unknown> = {}): Envelope =>
  frame('permission.requested', {
    requestId: 'req-q',
    expiresAt: '2026-10-08T12:10:00.000Z',
    ...aQuestionPayload(overrides),
  });

describe('the questions of a request — plan 24, B-13', () => {
  it('reads the interaction the server normalised — S-60', () => {
    const request = toRequest(asked());

    expect(request?.interaction).toEqual({
      malformed: false,
      questions: [
        {
          id: 'q1',
          header: 'Sections',
          prompt: QUESTIONS[0].prompt,
          multiSelect: true,
          options: QUESTIONS[0].options.map((option) => ({ ...option, preview: null })),
        },
        expect.objectContaining({
          id: 'q2',
          options: [
            expect.objectContaining({
              label: 'Classic prose',
              preview: expect.stringContaining('#'),
            }),
            expect.objectContaining({ label: 'Badge-heavy landing' }),
            { label: 'Plain list', description: 'No preview for this one.', preview: null },
          ],
        }),
        expect.objectContaining({ id: 'q3', header: 'Tone' }),
      ],
    });
    expect(request?.defaultToNo).toBe(false);
  });

  it('leaves every other request without one, on the card of before — S-60', () => {
    expect(toRequest(asked({ interaction: undefined }))?.interaction).toBeNull();
    expect(readInteraction({ kind: 'plan' })).toBeNull();
    expect(readInteraction('question')).toBeNull();
  });

  it.each([
    ['said malformed by the server', anInteraction([], true)],
    ['with no question', anInteraction([])],
    ['with a question missing its id', anInteraction([{ ...QUESTIONS[0], id: undefined }])],
    ['with a question missing its text', anInteraction([{ ...QUESTIONS[0], prompt: '' }])],
    [
      'with a question of one option',
      anInteraction([{ ...QUESTIONS[0], options: [QUESTIONS[0].options[0]] }]),
    ],
    [
      'with an option it cannot read',
      anInteraction([{ ...QUESTIONS[0], options: [...QUESTIONS[0].options, { label: 7 }] }]),
    ],
    ['with a question that is not an object', anInteraction(['Which?'])],
    ['with questions that are not a list', { kind: 'question', questions: 'many' }],
  ])('reads a question %s as one that can only be refused — fail closed', (_case, interaction) => {
    expect(readInteraction(interaction)).toEqual({ malformed: true, questions: [] });
  });

  it('reads a missing header and description as empty, and a missing multiSelect as single', () => {
    const read = readInteraction(
      anInteraction([
        {
          id: 'q1',
          prompt: 'Q?',
          options: [{ label: 'A' }, { label: 'B', description: 7 }],
        },
      ]),
    );

    expect(read?.questions[0]).toEqual({
      id: 'q1',
      header: '',
      prompt: 'Q?',
      multiSelect: false,
      options: [
        { label: 'A', description: '', preview: null },
        { label: 'B', description: '', preview: null },
      ],
    });
  });
});

describe('answering a question — plan 24, B-13', () => {
  it('sends the answers by question, the free answer absent when there is none — S-61', () => {
    const responses: Record<string, unknown>[] = [];
    const client = {
      respond: (type: string, payload: Record<string, unknown>) => {
        responses.push({ type, payload });
        return 'answer-1';
      },
    } as unknown as WsClient;

    sendAnswer(client, {
      requestId: 'req-q',
      frameId: 'frame-q',
      decision: 'allow',
      scope: 'once',
      reason: null,
      reach: null,
      answers: [
        { questionId: 'q1', selected: ['Usage'], other: null },
        { questionId: 'q2', selected: [], other: 'mine' },
      ],
    });

    expect(responses).toEqual([
      {
        type: 'permission.resolve',
        payload: {
          requestId: 'req-q',
          decision: 'allow',
          scope: 'once',
          answers: [
            { questionId: 'q1', selected: ['Usage'] },
            { questionId: 'q2', selected: [], other: 'mine' },
          ],
        },
      },
    ]);
  });

  it('reads the answers of a resolution, and none when it carries none — S-61', () => {
    const resolved = toOutcome(
      frame('permission.resolved', {
        requestId: 'req-q',
        decision: 'allow',
        auto: false,
        resolvedBy: 'me',
        answers: [
          { questionId: 'q1', selected: ['Usage', 7], other: 'and more' },
          'x',
          { selected: [] },
        ],
      }),
    );

    expect(resolved?.answers).toEqual([
      { questionId: 'q1', selected: ['Usage'], other: 'and more' },
    ]);
    expect(resolved?.interaction).toBeNull();
    expect(readAnswers(undefined)).toBeNull();
    expect(readAnswers([{ questionId: 'q1', selected: 'Usage' }])).toEqual([]);
  });
});
