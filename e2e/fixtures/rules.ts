import { expect, test } from '@playwright/test';
import type { Envelope } from '@remote-claude/contracts';

import { callApi } from './api';
import { prompt } from './live-session';
import type { AuthenticatedUser } from './auth';
import type { E2eSocket } from './ws';

/**
 * The rules and the trail of plan 03, from the outside: the HTTP API the browser and the app call,
 * and the turns a live session runs.
 *
 * Nothing here imports `backend/src` or `web/src` — what is proved at this level is that the
 * contract works for anybody who speaks it.
 */

/** A rule, as `/permission-rules` answers it. */
export interface ListedRule {
  readonly id: string;
  readonly scope: string;
  readonly pattern: string;
  readonly status: string;
  readonly grantedBy: string;
  readonly revokedAt: string | null;
}

/** One entry of the trail, as `GET /audit-entries` answers it. */
export interface TrailEntry {
  readonly id: string;
  readonly sessionId: string;
  readonly toolUseId: string | null;
  readonly toolName: string;
  readonly decision: string;
  readonly verdict: {
    readonly requestId: string;
    readonly auto: boolean;
    readonly ruleId: string | null;
    readonly scope: string;
    readonly resolvedFrom: string | null;
  } | null;
}

/** The caller's standing rules — revoked ones are not listed. */
export async function rulesOf(user: AuthenticatedUser): Promise<readonly ListedRule[]> {
  const response = await callApi(user, '/permission-rules');
  expect(response.status).toBe(200);
  return ((await response.json()) as { rules: readonly ListedRule[] }).rules;
}

/** Takes a rule back from the browser, whatever state it is in. For cleanup: it asserts nothing. */
export async function revokeQuietly(user: AuthenticatedUser, ruleId: string): Promise<void> {
  await callApi(user, `/permission-rules/${ruleId}`, { method: 'DELETE' });
}

/**
 * Takes back every rule the user still holds after each case of the spec, whatever happened.
 *
 * An `always` rule that outlived a failed case would answer every later spec's write on the same
 * stack, and the failure would show up far from its cause. Called at the top level of a spec.
 */
export function revokingEveryRuleAfterEach(user: () => AuthenticatedUser): void {
  test.afterEach(async () => {
    for (const rule of await rulesOf(user())) {
      await revokeQuietly(user(), rule.id);
    }
  });
}

/** The caller's trail of one session, newest first. */
export async function trailOf(
  user: AuthenticatedUser,
  sessionId: string,
): Promise<readonly TrailEntry[]> {
  const response = await callApi(
    user,
    `/audit-entries?${new URLSearchParams({ sessionId }).toString()}`,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { entries: readonly TrailEntry[] }).entries;
}

/** What one answer to a question says: the decision, and how far it reaches. */
export interface Answer {
  readonly decision: 'allow' | 'deny';
  readonly scope: 'once' | 'session' | 'project' | 'always';

  /** Required on a refusal: Claude is told why, so it can work with the "no". */
  readonly reason?: string;
}

/** What one turn produced, on the socket that watched it. */
export interface Turn {
  /** Every question put to a person during the turn. */
  readonly asked: readonly Envelope[];

  /** Every settlement published during the turn — by a person, a rule or the deadline. */
  readonly resolved: readonly Envelope[];

  /** Every tool that finished during the turn. */
  readonly completed: readonly Envelope[];

  /** Every tool that started during the turn. */
  readonly started: readonly Envelope[];
}

/**
 * Waits for the first frame that arrives from `mark` on and matches.
 *
 * `waitFor` alone would find the frame of an earlier turn — the same type, already received — and a
 * second turn would look finished before it had started.
 */
export function waitSince(
  socket: E2eSocket,
  mark: number,
  match: (frame: Envelope) => boolean,
  timeoutMs?: number,
): Promise<Envelope> {
  return socket.waitFor((frame) => socket.frames.indexOf(frame) >= mark && match(frame), timeoutMs);
}

/** The one frame of a list that must hold exactly one — a question, a settlement. */
export function onlyOne(frames: readonly Envelope[]): Envelope {
  expect(frames).toHaveLength(1);
  return frames[0] as Envelope;
}

/** The `requestId` a question carries. */
export function requestIdOf(frame: Envelope): string {
  return String((frame.payload as { requestId: string }).requestId);
}

/**
 * Sends the recorded turn that writes a file, and waits for it to finish.
 *
 * `answer` is who answers the question, if one comes: `null` means nobody on this socket does, which
 * is what a turn a rule settles needs — and a turn that asks anyway then waits for the deadline,
 * whose refusal the {@link Turn} shows. `by` is the socket that answers, when it is not the one
 * that prompted: the phone answering a session the browser opened.
 */
export async function writeTurn(
  socket: E2eSocket,
  sessionId: string,
  answer: Answer | null,
  by: E2eSocket = socket,
): Promise<Turn> {
  const mark = socket.frames.length;
  const answererMark = by.frames.length;
  prompt(socket, sessionId, 'tool-turn');

  if (answer !== null) {
    const request = await waitSince(
      by,
      answererMark,
      (frame) => frame.type === 'permission.requested',
    );
    by.respond(request, { requestId: requestIdOf(request), ...answer });
  }

  await waitSince(socket, mark, (frame) => frame.type === 'turn.completed', 30_000);
  const frames = socket.frames.slice(mark);
  const ofType = (type: string): Envelope[] => frames.filter((frame) => frame.type === type);

  return {
    asked: ofType('permission.requested'),
    resolved: ofType('permission.resolved'),
    completed: ofType('tool.completed'),
    started: ofType('tool.started'),
  };
}

/**
 * Asserts that a turn ran its write **without asking anybody**: no question went out, a rule
 * settled it — `auto`, `allow` — and the write then finished.
 */
export function expectRanUnasked(turn: Turn): void {
  expect(turn.asked).toHaveLength(0);
  expect(turn.resolved.map((frame) => frame.payload)).toEqual([
    expect.objectContaining({ decision: 'allow', auto: true }),
  ]);

  const write = turn.started.find(
    (frame) => (frame.payload as { toolName?: string }).toolName === 'Write',
  );
  const writeId = (write?.payload as { toolUseId?: string } | undefined)?.toolUseId;
  expect(writeId).toBeDefined();
  expect(
    turn.completed.some((frame) => (frame.payload as { toolUseId?: string }).toolUseId === writeId),
  ).toBe(true);
}

/**
 * The rule an answer to the write left standing, found by the pattern the question offered.
 *
 * @param offered the `pattern` of the suggestion that was chosen
 */
export async function ruleGrantedFor(
  user: AuthenticatedUser,
  offered: string,
): Promise<ListedRule> {
  const rule = (await rulesOf(user)).find((candidate) => candidate.pattern === offered);
  expect(rule, `no standing rule has the pattern ${offered}`).toBeDefined();
  return rule as ListedRule;
}

/** The pattern the question of a turn offered for a scope — what answering with it will grant. */
export function offeredPattern(request: Envelope, scope: 'project' | 'always'): string {
  const suggestions = (
    request.payload as {
      suggestions: readonly { scope: string; pattern?: string }[];
    }
  ).suggestions;
  const pattern = suggestions.find((suggestion) => suggestion.scope === scope)?.pattern;
  expect(pattern, `the question offered no ${scope} rule`).toBeDefined();
  return String(pattern);
}
