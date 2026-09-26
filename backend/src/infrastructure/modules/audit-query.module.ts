import { Module } from '@nestjs/common';

import { AUDIT_TRAIL_READER, QueryAuditTrailUseCase } from '@application/audit';
import type { AuditTrailReader } from '@application/audit';
import { AuditController } from '@adapter/inbound/http/audit/audit.controller';
import { DrizzleAuditTrailReader } from '@adapter/outbound/persistence/audit/drizzle-audit-trail.reader';
import { AuthModule } from './auth.module';

/**
 * The read side of `audit`: the query of the trail, and nothing else.
 *
 * A module of its own rather than more providers in {@link import('./audit.module').AuditModule},
 * for two reasons that are the same rule seen twice:
 *
 * - `audit` is **write-only** to every other module. Everybody imports `AuditModule` to write,
 *   and a reader provided there would be one import away from every flow that writes. Here it is
 *   provided to exactly one consumer — the query — and exported to none
 *   (docs/architecture/backend/03-modules.md#audit);
 * - the route needs `AuthModule` for its guard, and `AuthModule` imports `AuditModule` to record a
 *   device's approval. Putting the route there would be a cycle; putting it here is a leaf.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [
    { provide: AUDIT_TRAIL_READER, useClass: DrizzleAuditTrailReader },
    {
      provide: QueryAuditTrailUseCase,
      inject: [AUDIT_TRAIL_READER],
      useFactory: (reader: AuditTrailReader) => new QueryAuditTrailUseCase(reader),
    },
  ],
})
export class AuditQueryModule {}
