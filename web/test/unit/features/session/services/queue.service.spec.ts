import { describe, expect, it, vi } from 'vitest';

import type { Envelope } from '@remote-claude/contracts';

import { cancelQueuedPrompt, queueAfter } from '@/features/session/services/queue.service';
import type { WsClient } from '@/shared/api/ws-client';
import type { QueuedPrompt } from '@/features/session/types/live-session';
import { SESSION } from '../../../../support/session-tools';

const frame = (type: string, payload: Record<string, unknown>): Envelope =>
  ({ v: 1, id: 'f', kind: 'event', type, ts: 'now', sessionId: SESSION, payload }) as Envelope;

const waiting: QueuedPrompt = { queueId: 'q1', promptedBy: 'web', preview: 'first' };

describe('the queue of prompts, frame by frame — plan 08, B-34', () => {
  it('adds a prompt that waits, at the end, as the server said it — S-156', () => {
    const queue = queueAfter(
      [waiting],
      frame('prompt.queued', {
        queueId: 'q2',
        promptedBy: 'mobile',
        preview: 'second',
        position: 2,
      }),
    );

    expect(queue).toEqual([waiting, { queueId: 'q2', promptedBy: 'mobile', preview: 'second' }]);
  });

  it('takes the same prompt once, however many times it is announced', () => {
    const again = frame('prompt.queued', { queueId: 'q1', promptedBy: 'web', preview: 'first' });

    expect(queueAfter(queueAfter([], again), again)).toEqual([waiting]);
  });

  it('reads what is missing as nothing, rather than as a broken row', () => {
    expect(queueAfter([], frame('prompt.queued', { queueId: 'q3', preview: 7 }))).toEqual([
      { queueId: 'q3', promptedBy: '', preview: '' },
    ]);
  });

  it('takes out the one that left — started or cancelled — and the rest move up — S-157', () => {
    const queue = [waiting, { queueId: 'q2', promptedBy: 'web', preview: 'second' }];

    expect(
      queueAfter(queue, frame('prompt.dequeued', { queueId: 'q1', reason: 'started' })),
    ).toEqual([{ queueId: 'q2', promptedBy: 'web', preview: 'second' }]);
  });

  it('leaves it as it is for any other frame, or one that names no prompt', () => {
    const queue = [waiting];

    expect(queueAfter(queue, frame('message.delta', { queueId: 'q1' }))).toBe(queue);
    expect(queueAfter(queue, frame('prompt.dequeued', {}))).toBe(queue);
    const bare = Object.fromEntries(
      Object.entries(frame('prompt.queued', {})).filter(([key]) => key !== 'payload'),
    );
    expect(queueAfter(queue, bare as unknown as Envelope)).toBe(queue);
  });

  it('cancels a prompt of the queue by its id, over the socket', () => {
    const issue = vi.fn(() => 'cmd-1');

    expect(cancelQueuedPrompt({ issue } as unknown as WsClient, SESSION, 'q1')).toBe('cmd-1');
    expect(issue).toHaveBeenCalledWith('session.cancelQueuedPrompt', {
      sessionId: SESSION,
      queueId: 'q1',
    });
  });
});
