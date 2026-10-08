import { matchedInput, reachesFor } from '@domain/permission';
import type {
  PermissionDecision,
  PermissionOrigin,
  PermissionRequest,
  PermissionResolution,
  PermissionVia,
  QuestionAnswer,
  QuestionInteraction,
} from '@domain/permission';

/** One answer, as the contract's `QuestionAnswer` carries it: the free answer absent when there is none. */
export type AnswerPayload = {
  readonly questionId: string;
  readonly selected: readonly string[];
  readonly other?: string;
};

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

  /** The tool call it was about — what puts the decision on that tool's line, even when nobody was asked. */
  readonly toolUseId?: string;

  /** Why nobody was asked, when nobody was: a rule, or Permitir tudo. */
  readonly via?: PermissionVia;

  /** What the person answered, when the request was a question (plan 24, D-14). */
  readonly answers?: readonly AnswerPayload[];
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
  const common = {
    requestId: request.id,
    // The contract requires it; the SDK does not always give one, and an empty string is a
    // truthful "there was none" where a missing field would break a required one.
    toolUseId: request.toolUseId ?? '',
    toolName: request.toolName,
    title: `permission.tool.${request.toolName}`,
    input: request.input,
    riskHint: request.riskHint,
    expiresAt: request.expiresAt.toISOString(),
  };

  return request.interaction === null
    ? { ...common, ...permissionFields(request, ruleLifetimeMs) }
    : { ...common, ...questionFields(request.interaction) };
}

/** What asking leave to run a tool adds: the detail, refusal first, the scopes and the reaches. */
function permissionFields(
  request: PermissionRequest,
  ruleLifetimeMs: number,
): Readonly<Record<string, unknown>> {
  const detail = matchedInput(request.input);

  return {
    ...(detail === null ? {} : { description: detail }),
    // The UI pre-selects refusal, because silence never authorises.
    defaultToNo: true,
    suggestions: suggestionsFor(request, ruleLifetimeMs),
    // What a rule left by this answer may reach — computed here, and chosen by the client by name
    // only (plan 23, B-10). Every scope but `once` takes it.
    reaches: reachesFor(request.toolName, request.input),
  };
}

/**
 * What a question adds: the questions themselves, and nothing to authorise (plan 24, B-06).
 *
 * No `description` — the interaction is what a screen draws. Not refusal first: a question is
 * answered, and the focus goes to the first option (D-10). No scope and no reach: answering leaves
 * no rule (D-09).
 */
function questionFields(interaction: QuestionInteraction): Readonly<Record<string, unknown>> {
  return {
    defaultToNo: false,
    suggestions: [],
    reaches: [],
    interaction: interactionPayload(interaction),
  };
}

/**
 * The questions as the contract's `QuestionInteraction` carries them.
 *
 * What Claude wrote before a cut stays on this side: it is what the SDK expects back, and a screen
 * shows and answers with what the server published. A preview is absent rather than `null`.
 */
export function interactionPayload(
  interaction: QuestionInteraction,
): Readonly<Record<string, unknown>> {
  return {
    kind: interaction.kind,
    malformed: interaction.malformed,
    questions: interaction.questions.map((question) => ({
      id: question.id,
      header: question.header,
      prompt: question.prompt,
      multiSelect: question.multiSelect,
      options: question.options.map((option) => ({
        label: option.label,
        description: option.description,
        ...(option.preview === null ? {} : { preview: option.preview }),
      })),
    })),
  };
}

/** Answers as the contract carries them: by question, the free answer absent when there is none. */
export function answersPayload(answers: readonly QuestionAnswer[]): readonly AnswerPayload[] {
  return answers.map((answer) => ({
    questionId: answer.questionId,
    selected: [...answer.selected],
    ...(answer.other === null ? {} : { other: answer.other }),
  }));
}

/**
 * The scopes a screen may offer for this request.
 *
 * `project` and `always` carry **what the rule would be** — the `exact` pattern and how long it
 * would live — because the screen has to say it in full before anybody chooses, and a client that
 * derived either would be a second matcher or a hard-coded number
 * ([D-12](../../../../docs/plans/03-rules-and-audit/decisions.md#d-12--o-alcance-vem-na-pergunta)).
 * The other reaches, and their patterns, travel in `reaches`; `pattern` stays for a client that
 * does not read them, and is absent when there is no `exact` reach.
 *
 * They are left out when the invocation has no reach at all: the answer would be refused (S-58),
 * and offering what the server refuses is worse than not offering it. `project` also needs a
 * project, which a request with no workspace does not have.
 */
function suggestionsFor(
  request: PermissionRequest,
  ruleLifetimeMs: number,
): readonly Readonly<Record<string, unknown>>[] {
  const reaches = reachesFor(request.toolName, request.input);
  const ephemeral = [
    { scope: 'once', labelKey: 'permission.scope.once' },
    { scope: 'session', labelKey: 'permission.scope.session' },
  ];

  if (reaches.length === 0) {
    return ephemeral;
  }

  const exact = reaches.find((reach) => reach.reach === 'exact')?.patterns[0];
  const rule = { ...(exact === undefined ? {} : { pattern: exact }), lifetimeMs: ruleLifetimeMs };

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
  request: Pick<PermissionRequest, 'id' | 'toolUseId'>,
  resolution: PermissionResolution,
): ResolvedPermissionPayload {
  return {
    requestId: request.id,
    decision: resolution.decision,
    auto: resolution.auto,
    ...(resolution.resolvedBy === null ? {} : { resolvedBy: resolution.resolvedBy.value }),
    ...(resolution.resolvedFrom === null ? {} : { resolvedFrom: resolution.resolvedFrom }),
    ...(request.toolUseId === null || request.toolUseId === ''
      ? {}
      : { toolUseId: request.toolUseId }),
    ...(resolution.via === undefined ? {} : { via: resolution.via }),
    ...(resolution.answers === undefined ? {} : { answers: answersPayload(resolution.answers) }),
  };
}
