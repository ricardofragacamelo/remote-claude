import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { PermissionRequestRepository } from '@application/permission';
import type { PermissionRequest } from '@domain/permission';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { permissionRequests } from '@infra/database/schema';
import { runLogged } from '../query-logging';
import { toRow } from './permission-request.mapper';

/**
 * `permission_requests`, in PostgreSQL.
 *
 * The open write ignores a conflict on the primary key. The SDK redelivers a pending tool call
 * after a transport gap with the **same** `requestId`, and that redelivery is the same question,
 * not a second one — the registry already answers it from memory, and the row must not be
 * replaced by one that would reset a settlement already recorded.
 *
 * The update is an ordinary `UPDATE`, and that is not an exception to the append-only rule: the
 * trail of what was executed is `audit_entries`, which the database itself refuses to let anybody
 * rewrite. This table records a question changing — being given more time, and then ending.
 */
@Injectable()
export class DrizzlePermissionRequestRepository implements PermissionRequestRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async open(request: PermissionRequest): Promise<void> {
    await runLogged(
      this.context.logger,
      'permission.open',
      this.context.db
        .insert(permissionRequests)
        .values(toRow(request, this.context.clock.now()))
        .onConflictDoNothing({ target: permissionRequests.id }),
    );
  }

  async update(request: PermissionRequest): Promise<void> {
    await runLogged(
      this.context.logger,
      'permission.update',
      this.context.db
        .update(permissionRequests)
        .set(toRow(request, this.context.clock.now()))
        .where(eq(permissionRequests.id, request.id)),
    );
  }
}
