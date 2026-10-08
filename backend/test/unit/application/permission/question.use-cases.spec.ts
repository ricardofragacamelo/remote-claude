import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionAnswersInvalidError } from '@domain/permission';
import type { PermissionMode } from '@domain/session';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_SESSION,
  TEST_PERMISSION_SETTINGS,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/** An `AskUserQuestion` as the SDK hands it to `canUseTool`. */
const QUESTIONS = {
  questions: [
    {
      question: 'Which library?',
      header: 'Library',
      multiSelect: false,
      options: [
        { label: 'date-fns (Recommended)', description: 'small' },
        { label: 'luxon', description: 'zones', preview: '```ts\nDateTime.now()\n```' },
      ],
    },
    {
      question: 'Which checks?',
      header: 'Checks',
      multiSelect: true,
      options: [
        { label: 'Lint', description: '' },
        { label: 'Tests', description: '' },
      ],
    },
  ],
};

/** The question of {@link QUESTIONS}, asked in a given mode. */
const asking = (permissionMode: PermissionMode = 'default') =>
  aPermissionQuestion({ toolName: 'AskUserQuestion', input: QUESTIONS, permissionMode });

/** Every answer it needs. */
const ANSWERS = [
  { questionId: 'q1', selected: ['luxon'], other: null },
  { questionId: 'q2', selected: ['Lint'], other: 'and the CI' },
];

describe('a question of Claude — plan 24, B-06…B-08', () => {
  let harness: PermissionHarness;

  beforeEach(() => {
    harness = aPermissionModule();
  });

  const resolve = (overrides: Record<string, unknown> = {}) =>
    harness.resolve.execute({
      requestId: 'request-1',
      decision: 'allow',
      reason: null,
      scope: 'once',
      answers: ANSWERS,
      userId: PERMISSION_OWNER,
      resolvedFrom: 'web',
      watchesSession: () => true,
      ...overrides,
    } as Parameters<typeof harness.resolve.execute>[0]);

  describe('the request — B-06', () => {
    it('is published normalised, as a question and not a permission — S-24', async () => {
      await harness.request.execute(asking());

      const payload = harness.broadcaster.last('permission.requested');
      expect(payload).toMatchObject({
        toolName: 'AskUserQuestion',
        title: 'permission.tool.AskUserQuestion',
        riskHint: 'read',
        defaultToNo: false,
        suggestions: [],
        reaches: [],
        input: QUESTIONS,
        interaction: {
          kind: 'question',
          malformed: false,
          questions: [
            {
              id: 'q1',
              header: 'Library',
              prompt: 'Which library?',
              multiSelect: false,
              options: [
                { label: 'date-fns (Recommended)', description: 'small' },
                { label: 'luxon', description: 'zones', preview: '```ts\nDateTime.now()\n```' },
              ],
            },
            { id: 'q2', multiSelect: true },
          ],
        },
      });
      expect(payload).not.toHaveProperty('description');
      // Absent rather than null, and the originals Claude wrote never reach the wire.
      expect(JSON.stringify(payload)).not.toContain('originalLabel');
      expect(JSON.stringify(payload)).not.toContain('originalPrompt');
      const options = (payload?.['interaction'] as { questions: { options: object[] }[] })
        .questions[0]?.options;
      expect(options?.[0]).not.toHaveProperty('preview');
    });

    it('leaves every other request as it was — S-24', async () => {
      await harness.request.execute(aPermissionQuestion());

      const payload = harness.broadcaster.last('permission.requested');
      expect(payload).not.toHaveProperty('interaction');
      expect(payload).toMatchObject({ defaultToNo: true, riskHint: 'destructive' });
    });

    it('takes the deadline of a question, and a permission keeps its own — S-25', async () => {
      await harness.request.execute(asking());
      await harness.request.execute(aPermissionQuestion({ requestId: 'request-2' }));

      expect(harness.registry.find('request-1')?.expiresAt).toEqual(
        new Date(PERMISSION_NOW.getTime() + TEST_PERMISSION_SETTINGS.questionTimeoutMs),
      );
      expect(harness.registry.find('request-2')?.expiresAt).toEqual(
        new Date(PERMISSION_NOW.getTime() + TEST_PERMISSION_SETTINGS.timeoutMs),
      );
    });

    it('is put to the person in Permitir tudo — the regression of plan 23, S-11 — S-33', async () => {
      const outcome = await harness.request.execute(asking('allowAll'));

      expect(outcome.kind).toBe('pending');
      expect(harness.broadcaster.last('permission.requested')).toHaveProperty('interaction');
    });

    it('is put to the person in plan mode — S-34', async () => {
      const outcome = await harness.request.execute(asking('plan'));

      expect(outcome.kind).toBe('pending');
      expect(harness.broadcaster.last('permission.requested')).toHaveProperty('interaction');
    });

    it('reads a malformed input as a question that can only be refused', async () => {
      await harness.request.execute(
        aPermissionQuestion({ toolName: 'AskUserQuestion', input: { questions: [] } }),
      );

      expect(harness.broadcaster.last('permission.requested')).toMatchObject({
        interaction: { kind: 'question', malformed: true, questions: [] },
      });
    });

    it('is replayed with its interaction to a client that reattaches', async () => {
      await harness.request.execute(asking());

      expect(harness.request.pendingFor(PERMISSION_SESSION)[0]).toHaveProperty('interaction');
    });
  });

  describe('the answer — B-05, B-08', () => {
    beforeEach(async () => {
      await harness.request.execute(asking());
      harness.broadcaster.frames.length = 0;
    });

    it('settles with the answers, records them and publishes them — S-35', async () => {
      const settling = await resolve();

      expect(settling.won).toBe(true);
      expect(settling.resolution.answers).toEqual(ANSWERS);
      expect(harness.requests.updated).toEqual(['request-1']);
      expect(harness.registry.find('request-1')?.resolution?.answers).toEqual(ANSWERS);
      expect(harness.broadcaster.last('permission.resolved')).toMatchObject({
        requestId: 'request-1',
        decision: 'allow',
        answers: [
          { questionId: 'q1', selected: ['luxon'] },
          { questionId: 'q2', selected: ['Lint'], other: 'and the CI' },
        ],
      });
      // The free answer is absent rather than null where there is none.
      const published = harness.broadcaster.last('permission.resolved')?.['answers'] as object[];
      expect(published[0]).not.toHaveProperty('other');
    });

    it('refuses answers that do not fit, and leaves the question open — S-43', async () => {
      await expect(resolve({ answers: null })).rejects.toBeInstanceOf(
        PermissionAnswersInvalidError,
      );
      await expect(
        resolve({ answers: [{ questionId: 'q1', selected: ['luxon'], other: null }] }),
      ).rejects.toBeInstanceOf(PermissionAnswersInvalidError);

      expect(harness.registry.find('request-1')?.isPending).toBe(true);
      expect(harness.broadcaster.frames).toEqual([]);
      expect(harness.scheduler.armed).toBe(1);

      expect((await resolve()).won).toBe(true);
    });

    it('takes a refusal with no answers, and refuses one with answers — S-21, S-45', async () => {
      await expect(resolve({ decision: 'deny', reason: 'no' })).rejects.toBeInstanceOf(
        PermissionAnswersInvalidError,
      );

      const settling = await resolve({ decision: 'deny', reason: 'not now', answers: null });
      expect(settling.resolution).toMatchObject({ decision: 'deny', reason: 'not now' });
      expect(settling.resolution.answers).toBeUndefined();
      expect(harness.broadcaster.last('permission.resolved')).not.toHaveProperty('answers');
    });

    it('answers once, whatever scope and reach say, and leaves no rule — S-28', async () => {
      const settling = await resolve({ scope: 'always', reach: 'tool' });

      expect(settling.resolution.scope).toBe('once');
      expect(await harness.rules.listFor(PERMISSION_OWNER)).toEqual([]);
      expect(harness.registry.rulesOf(PERMISSION_SESSION)).toEqual([]);
    });

    it('treats scope session on a question as once too', async () => {
      const settling = await resolve({ scope: 'session' });

      expect(settling.resolution.scope).toBe('once');
      expect(harness.registry.rulesOf(PERMISSION_SESSION)).toEqual([]);
    });

    it('acks an answer to a question already settled, however it is shaped — S-38, S-39', async () => {
      await resolve();
      const second = await resolve({ answers: null });

      expect(second.won).toBe(false);
      expect(second.resolution.answers).toEqual(ANSWERS);
    });

    it('describes a pending question with its interaction, and an answered one with its answers — S-53', async () => {
      expect(
        harness.describe.execute({
          requestId: 'request-1',
          sessionId: PERMISSION_SESSION.value,
          userId: PERMISSION_OWNER,
        }),
      ).toMatchObject({ status: 'pending', request: { interaction: { kind: 'question' } } });

      await resolve();

      expect(
        harness.describe.execute({
          requestId: 'request-1',
          sessionId: PERMISSION_SESSION.value,
          userId: PERMISSION_OWNER,
        }),
      ).toMatchObject({
        status: 'resolved',
        answers: [{ questionId: 'q1', selected: ['luxon'] }, { questionId: 'q2' }],
        interaction: { kind: 'question', questions: [{ id: 'q1' }, { id: 'q2' }] },
      });
    });
  });

  describe('answers on a request that is not a question — S-20', () => {
    it('are refused, and the request stays open', async () => {
      await harness.request.execute(aPermissionQuestion());

      await expect(resolve()).rejects.toBeInstanceOf(PermissionAnswersInvalidError);
      expect(harness.registry.find('request-1')?.isPending).toBe(true);
    });
  });
});
