import { DomainError } from '@domain/shared';

/**
 * The request has been extended as often as the installation allows.
 *
 * Extending is **mexer na única proteção que existe**: our timeout is the only thing standing
 * between a person who walked away and a session that hangs for ever. So the ceiling is hard, and
 * reaching it is an error the UI has to show — not a silent no-op that leaves a countdown looking
 * extendable when it is not.
 */
export class PermissionExtensionLimitReachedError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'permission.error.extensionLimitReached';

  constructor(requestId: string, maxExtensions: number) {
    super(`permission request ${requestId} reached its ${String(maxExtensions)} extensions`, {
      requestId,
      maxExtensions,
    });
  }
}
