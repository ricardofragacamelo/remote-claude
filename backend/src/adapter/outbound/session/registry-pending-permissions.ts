import { Inject, Injectable } from '@nestjs/common';

import { PermissionRegistry } from '@application/permission';
import type { PendingPermissions } from '@application/session';
import type { SessionId } from '@domain/session';

/**
 * `session` asking `permission` how many questions a session is waiting on.
 *
 * The questions live in the permission registry — in memory, as the promises they are — and this
 * counts them without exposing one: the list of live sessions says that a person is being waited
 * on, and the requests themselves are the permission queue's to show.
 */
@Injectable()
export class RegistryPendingPermissions implements PendingPermissions {
  constructor(@Inject(PermissionRegistry) private readonly registry: PermissionRegistry) {}

  countFor(sessionId: SessionId): number {
    return this.registry.pendingFor(sessionId).length;
  }
}
