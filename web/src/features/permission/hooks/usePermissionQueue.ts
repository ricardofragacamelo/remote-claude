import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { wsClient } from '@/shared/api/ws';
import type { AppError } from '@/shared/api/errors';
import { useClock } from '@/shared/hooks/useClock';
import { answerRefusalOf, sendAnswer, sendExtension } from '../services/permission.service';
import type { Answer } from '../services/permission.service';
import { createPermissionQueueStore, permissionQueueOf } from '../store/permission.store';
import { usePermissionAttachment } from './usePermissionAttachment';
import type {
  PermissionDecision,
  PermissionOutcome,
  PermissionRequest,
  PermissionScope,
  QuestionAnswer,
  QuestionDraft,
  RuleReachKind,
} from '../types/permission';

/** What the screen gets: the questions, how the last ones ended, and the two things it can do. */
export interface PermissionQueue {
  readonly pending: readonly PermissionRequest[];
  readonly settled: readonly PermissionOutcome[];

  /** Milliseconds left on each card, recomputed on a tick the hook owns. */
  readonly remainingMs: Readonly<Record<string, number>>;

  /**
   * Why the last answer sent from here was refused — it arrived after the deadline, or after another
   * device answered (plan 09, S-61). Cleared when the next answer leaves.
   */
  readonly refusal: AppError | null;

  /**
   * @param reason why it was refused, when the person said — "keep planning, and…" (plan 08,
   *   B-22). A refusal without one carries the screen's own.
   * @param reach which of the request's reaches the rules of the answer take (plan 23, B-13)
   */
  answer(
    request: PermissionRequest,
    decision: PermissionDecision,
    scope: PermissionScope,
    reason?: string,
    reach?: RuleReachKind,
  ): void;
  extend(request: PermissionRequest): void;

  /** What was chosen so far on the card of each question, by request (plan 24, B-13). */
  readonly drafts: Readonly<Record<string, QuestionDraft>>;
  saveDraft(requestId: string, draft: QuestionDraft): void;

  /** Answers a question of Claude: `allow`, with the answers, and nothing to persist. */
  answerQuestion(request: PermissionRequest, answers: readonly QuestionAnswer[]): void;

  /** Does not answer a question: `deny`, with what the person wrote — or our sentence for nothing. */
  declineQuestion(request: PermissionRequest, reason: string): void;
}

/** What Claude is told when a person refuses from this screen. */
const REFUSED_HERE = 'refused from the web client';

/** What Claude is told when a person chose not to answer its question, and wrote nothing. */
const DECLINED_HERE = 'The user chose not to answer the question.';

/**
 * The permission queue of the session on screen.
 *
 * The **countdown lives here and not in the store**: it is a function of the clock, not of the
 * stream, and a store that re-rendered every subscriber once a second would be a store that makes
 * the conversation flicker.
 *
 * A card whose countdown reaches zero leaves as refused, with nobody asked to confirm: the
 * deadline has already refused it on the server, and asking about something that is over is asking
 * about nothing.
 */
export function usePermissionQueue(sessionId: string | null): PermissionQueue {
  const store = sessionId === null ? DETACHED : permissionQueueOf(sessionId);
  const pending = useStore(store, (state) => state.pending);
  const settled = useStore(store, (state) => state.settled);
  const markAnswering = useStore(store, (state) => state.markAnswering);
  const releaseAnswering = useStore(store, (state) => state.releaseAnswering);
  const expire = useStore(store, (state) => state.expire);
  const drafts = useStore(store, (state) => state.drafts);
  const saveDraft = useStore(store, (state) => state.saveDraft);

  // A subscription of its own, beside the conversation's. Both watch the same session and neither
  // knows the other exists; the transport attaches once and re-delivers to both. Shared with the
  // folder tab that keeps the session attached while it is not on screen (plan 06, S-181).
  usePermissionAttachment(sessionId);

  const now = useClock(pending.length > 0);

  useEffect(() => {
    for (const request of pending) {
      if (new Date(request.expiresAt).getTime() <= now) {
        expire(request.requestId);
      }
    }
  }, [pending, now, expire]);

  const { refusal, expectRefusal } = useAnswerRefusal(releaseAnswering);

  const send = useCallback(
    (request: PermissionRequest, answer: Omit<Answer, 'requestId' | 'frameId'>) => {
      if (request.isAnswering) {
        return;
      }

      markAnswering(request.requestId);

      const left = sendAnswer(wsClient, {
        requestId: request.requestId,
        frameId: request.frameId,
        ...answer,
      });

      if (left === null) {
        // The socket was down, so nothing was answered. Leaving the card disabled would leave a
        // question nobody can answer from a screen that looks like it is working on it — and a
        // question keeps its draft, to be sent when the socket is back.
        releaseAnswering(request.requestId);
      } else {
        expectRefusal(left, request.requestId);
      }
    },
    [markAnswering, releaseAnswering, expectRefusal],
  );

  const answer = useCallback(
    (
      request: PermissionRequest,
      decision: PermissionDecision,
      scope: PermissionScope,
      reason?: string,
      reach?: RuleReachKind,
    ) => {
      send(request, {
        decision,
        scope,
        // The contract requires a reason on a refusal: it goes into the trail and back to Claude
        // as a message, which is how the agent learns to propose something else.
        reason: decision === 'deny' ? refusalReason(reason, REFUSED_HERE) : null,
        reach: reach ?? null,
        answers: null,
      });
    },
    [send],
  );

  const answerQuestion = useCallback(
    (request: PermissionRequest, answers: readonly QuestionAnswer[]) => {
      // `once`, always: answering a question leaves no rule (plan 24, D-09).
      send(request, { decision: 'allow', scope: 'once', reason: null, reach: null, answers });
    },
    [send],
  );

  const declineQuestion = useCallback(
    (request: PermissionRequest, reason: string) => {
      send(request, {
        decision: 'deny',
        scope: 'once',
        reason: refusalReason(reason, DECLINED_HERE),
        reach: null,
        answers: null,
      });
    },
    [send],
  );

  const extend = useCallback((request: PermissionRequest) => {
    sendExtension(wsClient, request.requestId);
  }, []);

  const remainingMs = Object.fromEntries(
    pending.map((request) => [
      request.requestId,
      Math.max(0, new Date(request.expiresAt).getTime() - now),
    ]),
  );

  return {
    pending,
    settled,
    remainingMs,
    refusal,
    answer,
    extend,
    drafts,
    saveDraft,
    answerQuestion,
    declineQuestion,
  };
}

/**
 * The refusal of the last answer sent from here, among everything else on the socket: an `error`
 * whose `correlationId` is the answer's frame. A refused answer gives its card back, if the card is
 * still there — the answer did not count.
 */
function useAnswerRefusal(release: (requestId: string) => void): {
  readonly refusal: AppError | null;
  expectRefusal(answerId: string, requestId: string): void;
} {
  const [refusal, setRefusal] = useState<AppError | null>(null);
  const sent = useRef<{ readonly answerId: string; readonly requestId: string } | null>(null);

  useEffect(
    () =>
      wsClient.observe((frame) => {
        const last = sent.current;
        const refused = last === null ? null : answerRefusalOf(frame, last.answerId);

        if (last !== null && refused !== null) {
          sent.current = null;
          release(last.requestId);
          setRefusal(refused);
        }
      }),
    [release],
  );

  const expectRefusal = useCallback((answerId: string, requestId: string) => {
    sent.current = { answerId, requestId };
    setRefusal(null);
  }, []);

  return { refusal, expectRefusal };
}

/** What a screen with no session reads: an empty queue, attached to nothing. */
const DETACHED = createPermissionQueueStore();

/** The reason a refusal carries: what the person wrote, or the screen's own when they wrote nothing. */
function refusalReason(written: string | undefined, ours: string): string {
  const said = written?.trim() ?? '';
  return said === '' ? ours : said;
}
