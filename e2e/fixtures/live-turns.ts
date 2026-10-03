import { expect } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';

import { unknownVariants } from './backend-log';
import { closeSession } from './live-session';
import type { E2eSocket } from './ws';

/**
 * Real turns of the real Claude, from the outside — what the specs of `smoke-live/` share.
 *
 * A real turn asks what it asks, in an order nobody wrote: each spec says which questions a careful
 * person would allow, and the answering is the same loop for all of them.
 */

/** One question of a real turn: the tool, and its exact input. */
export interface LiveQuestion {
  readonly toolName: string;
  readonly input: unknown;
}

/** What a real turn did: each question as `tool:allowed`, and every frame it produced. */
export interface LiveTurn {
  readonly asked: readonly string[];
  readonly frames: readonly Envelope[];
}

/**
 * Answers every question of a turn until it ends — allowed when `allows` says so, refused with
 * `reason` otherwise — at once: the deadline of this stack is seconds.
 *
 * @param mark how many frames the socket held before the prompt of the turn was sent
 */
export async function answeredUntilTheTurnEnds(
  socket: E2eSocket,
  allows: (question: LiveQuestion) => boolean,
  reason: string,
  mark: number,
): Promise<LiveTurn> {
  const answered = new Set<string>();
  const asked: string[] = [];

  for (;;) {
    const next = await socket.waitFor(
      (frame) =>
        socket.frames.indexOf(frame) >= mark &&
        ((frame.type === 'permission.requested' && !answered.has(frame.id)) ||
          frame.type === 'turn.completed'),
      540_000,
    );

    if (next.type === 'turn.completed') {
      return { asked, frames: socket.frames.slice(mark) };
    }

    answered.add(next.id);
    const payload = next.payload as { requestId: string; toolName: string; input?: unknown };
    const allowed = allows({ toolName: payload.toolName, input: payload.input });

    socket.respond(
      next,
      allowed
        ? { requestId: payload.requestId, decision: 'allow', scope: 'once' }
        : { requestId: payload.requestId, decision: 'deny', reason, scope: 'once' },
    );
    asked.push(`${payload.toolName}:${String(allowed)}`);
  }
}

/**
 * Ends a real session and reads **the claim of the suite**: no message of it fell into the unknown
 * branch of the mapper, which logs `unmapped sdk message variant — dropped` and carries on.
 */
export async function endedWithEveryMessageKnown(
  socket: E2eSocket,
  sessionId: string,
): Promise<void> {
  await closeSession(socket, sessionId);
  expect(unknownVariants()).toEqual([]);
}
