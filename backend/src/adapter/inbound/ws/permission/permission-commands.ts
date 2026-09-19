import { z } from 'zod';

import { PERMISSION_SCOPES } from '@domain/permission';

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
    reason: z.string().min(1).optional(),
  }),

  /** The payload carries only the request: the increment and the ceiling are the backend's. */
  extend: z.object({ requestId: z.string().min(1) }),
};

/** DI tokens of the permission frames, one per `type` of the contract. */
export const PERMISSION_HANDLERS = {
  resolve: Symbol('permission.resolve handler'),
  extend: Symbol('permission.extend handler'),
};
