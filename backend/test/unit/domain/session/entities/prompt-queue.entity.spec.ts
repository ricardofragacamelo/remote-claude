import { describe, expect, it } from 'vitest';

import {
  previewOf,
  PromptQueue,
  QUEUE_PREVIEW_LENGTH,
  QueuedPromptNotFoundError,
  QueuedPromptStartedError,
  REMEMBERED_DEPARTURES,
} from '@domain/session';

const aPrompt = (queueId: string, text = queueId) => ({
  queueId,
  text,
  promptedBy: 'web',
  preview: previewOf(text),
});

describe('the queue of prompts of a session — plan 08, D-14', () => {
  it('sends a prompt now when no turn runs, and holds the next until the turn ends — S-156', () => {
    const queue = new PromptQueue();

    expect(queue.submit(aPrompt('q1'))).toEqual({ kind: 'now' });
    expect(queue.turnOpen).toBe(true);
    expect(queue.submit(aPrompt('q2'))).toEqual({ kind: 'queued', position: 1 });
    expect(queue.submit(aPrompt('q3'))).toEqual({ kind: 'queued', position: 2 });
    expect(queue.size).toBe(2);
  });

  it('runs what waits in the order it arrived, and frees the session when nothing does — S-160', () => {
    const queue = new PromptQueue();
    queue.submit(aPrompt('q1'));
    queue.submit(aPrompt('q2'));
    queue.submit(aPrompt('q3'));

    expect(queue.turnEnded()?.queueId).toBe('q2');
    expect(queue.turnEnded()?.queueId).toBe('q3');
    expect(queue.turnEnded()).toBeNull();
    expect(queue.turnOpen).toBe(false);
    expect(queue.submit(aPrompt('q4'))).toEqual({ kind: 'now' });
  });

  it('takes a waiting prompt out before it reaches Claude, and moves the ones behind up — S-157', () => {
    const queue = new PromptQueue();
    queue.submit(aPrompt('q1'));
    queue.submit(aPrompt('q2'));
    queue.submit(aPrompt('q3'));

    expect(queue.cancel('q2')).toBe('cancelled');
    expect(queue.submit(aPrompt('q4'))).toEqual({ kind: 'queued', position: 2 });
    expect(queue.turnEnded()?.queueId).toBe('q3');
  });

  it('refuses to cancel what already started, and answers a second cancel with no effect — S-158, S-159', () => {
    const queue = new PromptQueue();
    queue.submit(aPrompt('q1'));
    queue.submit(aPrompt('q2'));
    queue.submit(aPrompt('q3'));
    queue.turnEnded();
    queue.cancel('q3');

    expect(() => queue.cancel('q2')).toThrow(QueuedPromptStartedError);
    expect(queue.cancel('q3')).toBe('alreadyCancelled');
    expect(() => queue.cancel('q-never')).toThrow(QueuedPromptNotFoundError);
  });

  it(`remembers the last ${String(REMEMBERED_DEPARTURES)} prompts that left — fron`, () => {
    const queue = new PromptQueue();
    queue.submit(aPrompt('first'));

    for (let index = 0; index <= REMEMBERED_DEPARTURES; index += 1) {
      queue.submit(aPrompt(`q${String(index)}`));
      queue.cancel(`q${String(index)}`);
    }

    expect(() => queue.cancel('q0')).toThrow(QueuedPromptNotFoundError);
    expect(queue.cancel(`q${String(REMEMBERED_DEPARTURES)}`)).toBe('alreadyCancelled');
  });

  it('drops what waits when the session ends', () => {
    const queue = new PromptQueue();
    queue.submit(aPrompt('q1'));
    queue.submit(aPrompt('q2'));

    expect(queue.drain().map((prompt) => prompt.queueId)).toEqual(['q2']);
    expect(queue.size).toBe(0);
  });

  it('previews the start of a prompt, on one line, cut', () => {
    expect(previewOf('  two\n lines  ')).toBe('two lines');
    const long = previewOf('x'.repeat(QUEUE_PREVIEW_LENGTH + 10));
    expect(long).toHaveLength(QUEUE_PREVIEW_LENGTH);
    expect(long.endsWith('…')).toBe(true);
  });
});
