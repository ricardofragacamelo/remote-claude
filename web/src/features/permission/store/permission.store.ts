import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { Envelope } from '@remote-claude/contracts';

import { toExtension, toOutcome, toRequest } from '../services/permission.service';
import type { PermissionOutcome, PermissionRequest, QuestionDraft } from '../types/permission';

/** The questions of one session, and how the last few were settled. */
export interface PermissionQueueState {
  readonly pending: readonly PermissionRequest[];

  /** How the requests that have left the queue ended, newest last. */
  readonly settled: readonly PermissionOutcome[];

  /**
   * What was chosen so far on the card of each question, by request (plan 24, R-06). It outlives a
   * reset — a replay republishes the question, and finds its draft — and goes when the question is
   * over, however it ended.
   */
  readonly drafts: Readonly<Record<string, QuestionDraft>>;

  /** Keeps what was chosen on the card of a question. */
  saveDraft(requestId: string, draft: QuestionDraft): void;

  /** Applies one frame of the session's stream. */
  apply(frame: Envelope): void;

  /** Marks a card as answering, so it takes no second click. */
  markAnswering(requestId: string): void;

  /** Gives the card back after an answer that never left — the socket was down. */
  releaseAnswering(requestId: string): void;

  /**
   * Drops a card whose deadline ran out on screen.
   *
   * The card leaves **as refused**, and without asking anybody to confirm it: the deadline has
   * already refused it on the server, and a dialogue about something that is over is a dialogue
   * about nothing (docs/architecture/web/04-state-and-data.md#a-fila-de-permissão).
   */
  expire(requestId: string): void;

  /** Drops everything, which is what a replay gap and a change of session call for. */
  reset(): void;
}

/**
 * The permission queue: the most delicate state in the front.
 *
 * Four rules hold it together, and each closes a way of being wrong that a person would notice:
 *
 * - **the queue reacts to events, never to its own optimism.** A request resolved on somebody's
 *   phone leaves this queue because `permission.resolved` said so, not because this client did
 *   anything;
 * - **losing the race is not an error.** The card leaves showing who won — the answer that
 *   reached the agent is the one the server published, not necessarily the one sent from here;
 * - **a card that is answering takes no second click**;
 * - **an expired card leaves as refused, silently.** Silence never authorises, on either end.
 *
 * **One queue per session**: a folder tab that is not on screen keeps its sessions attached, and the
 * question one of them asks has to be waiting in that session's queue when the tab comes back —
 * never in the queue of whichever session was shown last
 * ([06 · D-11](../../../../../docs/plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas)).
 */
export function createPermissionQueueStore(): PermissionQueueStore {
  return createStore<PermissionQueueState>((set) => ({
    pending: [],
    settled: [],
    drafts: {},

    saveDraft: (requestId, draft) =>
      set((state) => ({ ...state, drafts: { ...state.drafts, [requestId]: draft } })),

    apply: (frame) =>
      set((state) => {
        const requested = toRequest(frame);
        if (requested !== null) {
          // Replacing rather than appending: a reconnect republishes what is still open, and the
          // same question twice on screen is the same question twice.
          return {
            ...state,
            pending: [...without(state.pending, requested.requestId), requested],
          };
        }

        const outcome = toOutcome(frame);
        if (outcome !== null) {
          return {
            ...state,
            pending: without(state.pending, outcome.requestId),
            settled: [...state.settled, settledOf(outcome, state.pending)],
            // Answered here or elsewhere, or refused by the deadline: what was being chosen is moot.
            drafts: withoutDraft(state.drafts, outcome.requestId),
          };
        }

        const extension = toExtension(frame);
        if (extension !== null) {
          return {
            ...state,
            pending: state.pending.map((request) =>
              request.requestId === extension.requestId
                ? { ...request, expiresAt: extension.expiresAt }
                : request,
            ),
          };
        }

        return state;
      }),

    markAnswering: (requestId) =>
      set((state) => ({ ...state, pending: answering(state.pending, requestId, true) })),

    releaseAnswering: (requestId) =>
      set((state) => ({ ...state, pending: answering(state.pending, requestId, false) })),

    expire: (requestId) =>
      set((state) => {
        const expired = state.pending.find((request) => request.requestId === requestId);

        return expired === undefined
          ? state
          : {
              ...state,
              pending: without(state.pending, requestId),
              settled: [
                ...state.settled,
                {
                  requestId,
                  decision: 'deny' as const,
                  auto: true,
                  via: null,
                  resolvedBy: null,
                  resolvedFrom: null,
                  toolUseId: expired.toolUseId === '' ? null : expired.toolUseId,
                  answeredHere: false,
                  interaction: expired.interaction,
                  answers: null,
                },
              ],
              drafts: withoutDraft(state.drafts, requestId),
            };
      }),

    reset: () => {
      // The drafts stay: the questions they belong to are republished, and find them again.
      set((state) => ({ ...state, pending: [], settled: [] }));
    },
  }));
}

/** The queue of one session. */
export type PermissionQueueStore = StoreApi<PermissionQueueState>;

const queues = new Map<string, PermissionQueueStore>();

/** The queue of one session — the same one for everybody who asks, created on the first ask. */
export function permissionQueueOf(sessionId: string): PermissionQueueStore {
  const existing = queues.get(sessionId);

  if (existing !== undefined) {
    return existing;
  }

  const created = createPermissionQueueStore();
  queues.set(sessionId, created);
  return created;
}

/** The requests whose card has had its one chance to take the focus. */
const arrived = new Set<string>();

/**
 * Whether this is the first time the card of `requestId` is drawn — the only moment it may take the
 * focus (plan 09, D-13). A card drawn again — moved to the place of its tool, or shown again with its
 * tab — never takes it a second time.
 */
export function claimArrival(requestId: string): boolean {
  if (arrived.has(requestId)) {
    return false;
  }

  arrived.add(requestId);
  return true;
}

/** Drops every queue — what a sign-out calls for, and what keeps one test from seeing another's. */
export function forgetPermissionQueues(): void {
  queues.clear();
  arrived.clear();
}

/**
 * How a request left the queue, with what only the card knew: the tool it was about, and whether the
 * answer that won is the one this screen sent — a phone that won the race answered it, not us.
 */
function settledOf(
  outcome: PermissionOutcome,
  pending: readonly PermissionRequest[],
): PermissionOutcome {
  const asked = pending.find((request) => request.requestId === outcome.requestId);

  return asked === undefined
    ? outcome
    : {
        ...outcome,
        toolUseId: asked.toolUseId === '' ? null : asked.toolUseId,
        answeredHere: asked.isAnswering && !outcome.auto && outcome.resolvedFrom !== 'mobile',
        interaction: asked.interaction,
      };
}

function withoutDraft(
  drafts: Readonly<Record<string, QuestionDraft>>,
  requestId: string,
): Readonly<Record<string, QuestionDraft>> {
  return requestId in drafts
    ? Object.fromEntries(Object.entries(drafts).filter(([id]) => id !== requestId))
    : drafts;
}

function without(
  pending: readonly PermissionRequest[],
  requestId: string,
): readonly PermissionRequest[] {
  return pending.filter((request) => request.requestId !== requestId);
}

function answering(
  pending: readonly PermissionRequest[],
  requestId: string,
  isAnswering: boolean,
): readonly PermissionRequest[] {
  return pending.map((request) =>
    request.requestId === requestId ? { ...request, isAnswering } : request,
  );
}
