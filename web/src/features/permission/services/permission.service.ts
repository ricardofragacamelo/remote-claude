import type { Envelope } from '@remote-claude/contracts';

import type { WsClient } from '@/shared/api/ws-client';
import { isRecord, readText as text } from '@/shared/lib/json';
import type {
  PermissionDecision,
  PermissionOutcome,
  PermissionRequest,
  PermissionScope,
  RiskHint,
  ScopeSuggestion,
} from '../types/permission';

/** The frames of the permission round trip, by name. */
export const PERMISSION_FRAMES = {
  requested: 'permission.requested',
  resolve: 'permission.resolve',
  resolved: 'permission.resolved',
  extend: 'permission.extend',
  extended: 'permission.extended',
} as const;

/** What answering carries. `reason` is required on a refusal, by the contract and by the server. */
export interface Answer {
  readonly requestId: string;
  readonly frameId: string;
  readonly decision: PermissionDecision;
  readonly scope: PermissionScope;
  readonly reason: string | null;
}

/**
 * Answers a question the server is holding its agent loop open for.
 *
 * A **response** and not a command: `correlationId` names the request being answered, which is
 * what the kind of the frame exists to say.
 *
 * @returns whether the frame left; a socket that is not ready silently sends nothing
 */
export function sendAnswer(client: WsClient, answer: Answer): boolean {
  return client.respond(
    PERMISSION_FRAMES.resolve,
    {
      requestId: answer.requestId,
      decision: answer.decision,
      scope: answer.scope,
      ...(answer.reason === null ? {} : { reason: answer.reason }),
    },
    answer.frameId,
  );
}

/**
 * Asks for more time.
 *
 * The payload carries **only** the request: the increment and the ceiling come from the backend's
 * configuration, because our timeout is the only protection against a hung session and a client
 * that could choose that number could switch it off.
 */
export function sendExtension(client: WsClient, requestId: string): boolean {
  return client.command(PERMISSION_FRAMES.extend, { requestId });
}

/** The risks the contract carries. Anything else is read as the safest thing to assume: none. */
const RISKS = new Set<string>(['read', 'write', 'destructive']);

/** The scopes this build honours. A suggestion for any other is dropped rather than offered. */
const SCOPES = new Set<string>(['once', 'session']);

/**
 * The feature's model of a `permission.requested` frame, or `null` when it is not one.
 *
 * This is where the shape of the backend stops existing. A frame missing anything a person needs
 * in order to decide is **dropped**, not shown with a blank in it: a card that cannot say what it
 * is asking about is a card nobody can answer honestly.
 */
export function toRequest(frame: Envelope): PermissionRequest | null {
  const payload = frame.payload;

  if (frame.type !== PERMISSION_FRAMES.requested || payload === undefined) {
    return null;
  }

  const requestId = text(payload, 'requestId');
  const toolName = text(payload, 'toolName');
  // Required by the contract and checked here, even though the label is resolved from the tool
  // name: a frame missing it is a frame from something that is not this protocol.
  const title = text(payload, 'title');
  const expiresAt = text(payload, 'expiresAt');
  const riskHint = text(payload, 'riskHint');

  if (
    requestId === null ||
    toolName === null ||
    title === null ||
    expiresAt === null ||
    riskHint === null ||
    !RISKS.has(riskHint)
  ) {
    return null;
  }

  return {
    requestId,
    frameId: frame.id,
    toolUseId: text(payload, 'toolUseId') ?? '',
    toolName,
    description: text(payload, 'description'),
    input: isRecord(payload['input']) ? payload['input'] : {},
    riskHint: riskHint as RiskHint,
    // Absent reads as `true`. The safe default is not a convenience here: it is the rule.
    defaultToNo: payload['defaultToNo'] !== false,
    expiresAt,
    suggestions: readSuggestions(payload['suggestions']),
    isAnswering: false,
  };
}

/** The feature's model of a `permission.resolved` frame, or `null` when it is not one. */
export function toOutcome(frame: Envelope): PermissionOutcome | null {
  const payload = frame.payload;

  if (frame.type !== PERMISSION_FRAMES.resolved || payload === undefined) {
    return null;
  }

  const requestId = text(payload, 'requestId');
  const decision = text(payload, 'decision');

  if (requestId === null || (decision !== 'allow' && decision !== 'deny')) {
    return null;
  }

  return {
    requestId,
    decision,
    auto: payload['auto'] === true,
    resolvedBy: text(payload, 'resolvedBy'),
  };
}

/** The new deadline of a `permission.extended` frame, or `null` when it is not one. */
export function toExtension(
  frame: Envelope,
): { readonly requestId: string; readonly expiresAt: string } | null {
  const payload = frame.payload;

  if (frame.type !== PERMISSION_FRAMES.extended || payload === undefined) {
    return null;
  }

  const requestId = text(payload, 'requestId');
  const expiresAt = text(payload, 'expiresAt');

  return requestId === null || expiresAt === null ? null : { requestId, expiresAt };
}

function readSuggestions(value: unknown): readonly ScopeSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const scope = text(entry, 'scope');
    const labelKey = text(entry, 'labelKey');

    // A scope this build cannot honour is dropped rather than offered: the server would refuse it,
    // and a button that always fails is worse than one that is not there.
    return scope !== null && labelKey !== null && SCOPES.has(scope)
      ? [{ scope: scope as PermissionScope, labelKey }]
      : [];
  });
}
