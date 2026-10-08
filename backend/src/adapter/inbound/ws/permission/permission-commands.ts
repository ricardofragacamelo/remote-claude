import {
  PERMISSION_RESOLVE_PAYLOAD_LIMITS as RESOLVE_LIMITS,
  QUESTION_ANSWER_LIMITS as ANSWER_LIMITS,
} from '@remote-claude/contracts';
import { z } from 'zod';

import { PERMISSION_SCOPES, RULE_REACHES } from '@domain/permission';

/**
 * One answer to one question, as the contract bounds it — the numbers read from the generated
 * contract, never repeated here. Whether it fits the question is the domain's to say.
 */
const answer = z.object({
  questionId: z.string().min(1).max(ANSWER_LIMITS.questionId.maxLength),
  selected: z.array(z.string()).max(ANSWER_LIMITS.selected.maxItems),
  other: z.string().max(ANSWER_LIMITS.other.maxLength).optional(),
});

/** The payloads the permission frames carry, as the contract declares them. */
export const permissionSchemas = {
  /**
   * The answer to a `permission.requested`.
   *
   * `reason` is optional **here** and required by the entity when the decision is `deny`. The
   * condition lives in the schema of the contract (`x-required-when`) and in the domain, and not
   * in a third copy written by hand in this file: a rule stated three times is a rule that
   * eventually holds in two of them.
   */
  resolve: z.object({
    requestId: z.string().min(1),
    decision: z.enum(['allow', 'deny']),
    scope: z.enum(PERMISSION_SCOPES).optional(),
    reach: z.enum(RULE_REACHES).optional(),
    reason: z.string().min(1).optional(),
    // Required for an `allow` of a question — which this payload cannot tell, so the domain says it
    // (docs/architecture/shared/05-websocket-protocol.md#campo-obrigatório-por-condição).
    answers: z.array(answer).max(RESOLVE_LIMITS.answers.maxItems).optional(),
  }),

  /** The payload carries only the request: the increment and the ceiling are the backend's. */
  extend: z.object({ requestId: z.string().min(1) }),
};

/** DI tokens of the permission frames, one per `type` of the contract. */
export const PERMISSION_HANDLERS = {
  resolve: Symbol('permission.resolve handler'),
  extend: Symbol('permission.extend handler'),
};
