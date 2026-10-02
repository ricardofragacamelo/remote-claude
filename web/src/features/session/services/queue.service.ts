import type { Envelope } from '@remote-claude/contracts';

import type { WsClient } from '@/shared/api/ws-client';
import { readText } from '@/shared/lib/json';
import type { QueuedPrompt } from '../types/live-session';

/**
 * The queue of prompts after one frame: a prompt waiting is added, one that left is taken out, and
 * the ones behind it move up (plan 08, B-34). Any other frame leaves it as it is.
 */
export function queueAfter(
  queue: readonly QueuedPrompt[],
  frame: Envelope,
): readonly QueuedPrompt[] {
  const payload = frame.payload ?? {};
  const queueId = readText(payload, 'queueId');

  if (queueId === null) {
    return queue;
  }

  if (frame.type === 'prompt.queued') {
    const rest = queue.filter((prompt) => prompt.queueId !== queueId);
    return [
      ...rest,
      {
        queueId,
        promptedBy: readText(payload, 'promptedBy') ?? '',
        preview: typeof payload['preview'] === 'string' ? payload['preview'] : '',
      },
    ];
  }

  return frame.type === 'prompt.dequeued'
    ? queue.filter((prompt) => prompt.queueId !== queueId)
    : queue;
}

/**
 * Takes a prompt out of the queue before it reaches Claude — any client watching may.
 *
 * @returns the id of the command frame, or `null` when nothing left
 */
export function cancelQueuedPrompt(
  client: WsClient,
  sessionId: string,
  queueId: string,
): string | null {
  return client.issue('session.cancelQueuedPrompt', { sessionId, queueId });
}
