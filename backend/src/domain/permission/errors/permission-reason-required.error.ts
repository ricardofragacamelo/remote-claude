import { DomainError } from '@domain/shared';

/**
 * A refusal arrived without a reason.
 *
 * The reason is not paperwork: it goes into the audit trail and back to Claude as a message, which
 * is how the agent learns to propose something else instead of retrying the same command. A
 * refusal nobody can account for is a refusal nobody can learn from.
 *
 * The contract carries the same rule as `x-required-when`, so a client is refused at the schema
 * before it reaches here. This is the other half: the entity does not depend on the transport
 * having checked.
 */
export class PermissionReasonRequiredError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'permission.error.reasonRequired';

  constructor(requestId: string) {
    super(`refusing permission request ${requestId} requires a reason`, { requestId });
  }
}
