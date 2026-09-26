import { matchedInput, patternForInvocation } from '@domain/permission';
import type {
  PermissionDecision,
  PermissionOrigin,
  PermissionRequest,
  PermissionResolution,
} from '@domain/permission';

/**
 * A settled request, as the contract's `permission.resolved` describes it.
 *
 * Typed rather than a bag of fields because two channels send it — the event every watching
 * connection receives, and the HTTP answer a deep link revalidates against — and a client that
 * branches on one of them must never find the other spelled differently. A type alias and not an
 * interface, so it still fits the `Record` a broadcast frame carries.
 */
export type ResolvedPermissionPayload = {
  readonly requestId: string;
  readonly decision: PermissionDecision;
  readonly auto: boolean;

  /** Who answered, when somebody did — or whose rule answered, when a rule did. */
  readonly resolvedBy?: string;
  readonly resolvedFrom?: PermissionOrigin;
};

/**
 * A request, as the contract's `permission.requested` describes it.
 *
 * `title` is a key rather than a sentence, and `description` is the input itself — the command
 * line, the path being written. Between them the client has everything it needs to say what is
 * being asked, in the language of whoever is holding the device, and the server has sent no prose
 * (docs/architecture/shared/02-i18n.md).
 *
 * One function for every channel that describes a pending request — the frame that asks, the
 * replay a reconnecting client is owed, and the HTTP revalidation a push opens — because the
 * second copy is the one that drifts.
 *
 * @param ruleLifetimeMs how long a `project` or `always` rule granted from this question would
 *   live — the installation's default, which the screen shows before anybody chooses
 */
export function requestedPayload(
  request: PermissionRequest,
  ruleLifetimeMs: number,
): Readonly<Record<string, unknown>> {
  const detail = matchedInput(request.input);

  return {
    requestId: request.id,
    // The contract requires it; the SDK does not always give one, and an empty string is a
    // truthful "there was none" where a missing field would break a required one.
    toolUseId: request.toolUseId ?? '',
    toolName: request.toolName,
    title: `permission.tool.${request.toolName}`,
    ...(detail === null ? {} : { description: detail }),
    input: request.input,
    riskHint: request.riskHint,
    // Always. The UI pre-selects refusal, because silence never authorises.
    defaultToNo: true,
    expiresAt: request.expiresAt.toISOString(),
    suggestions: suggestionsFor(request, ruleLifetimeMs),
  };
}

/**
 * The scopes a screen may offer for this request.
 *
 * `project` and `always` carry **what the rule would be** — the pattern the answer will grant and
 * how long it will live — because the screen has to say it in full before anybody chooses, and a
 * client that derived either would be a second matcher or a hard-coded number
 * ([D-12](../../../../docs/plans/03-rules-and-audit/decisions.md#d-12--o-alcance-vem-na-pergunta)).
 *
 * They are left out when no pattern can be written for the invocation: the answer would be refused
 * (S-58), and offering what the server refuses is worse than not offering it. `project` also needs
 * a project, which a request with no workspace does not have.
 */
function suggestionsFor(
  request: PermissionRequest,
  ruleLifetimeMs: number,
): readonly Readonly<Record<string, unknown>>[] {
  const pattern = patternForInvocation(request.toolName, request.input);
  const ephemeral = [
    { scope: 'once', labelKey: 'permission.scope.once' },
    { scope: 'session', labelKey: 'permission.scope.session' },
  ];

  if (pattern === null) {
    return ephemeral;
  }

  const rule = { pattern, lifetimeMs: ruleLifetimeMs };

  return [
    ...ephemeral,
    ...(request.projectPath === null
      ? []
      : [{ scope: 'project', labelKey: 'permission.scope.project', ...rule }]),
    { scope: 'always', labelKey: 'permission.scope.always', ...rule },
  ];
}

/**
 * How a request was settled, as the contract's `permission.resolved` describes it.
 *
 * The optional fields are **absent** rather than `null` when there is nothing to say: the schema
 * types them as strings, and a generated client refuses a `null` where it expects one.
 */
export function resolvedPayload(
  requestId: string,
  resolution: PermissionResolution,
): ResolvedPermissionPayload {
  return {
    requestId,
    decision: resolution.decision,
    auto: resolution.auto,
    ...(resolution.resolvedBy === null ? {} : { resolvedBy: resolution.resolvedBy.value }),
    ...(resolution.resolvedFrom === null ? {} : { resolvedFrom: resolution.resolvedFrom }),
  };
}
