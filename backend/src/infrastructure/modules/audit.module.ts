import { Module } from '@nestjs/common';

import { AUDIT_REPOSITORY, RecordToolInvocationUseCase } from '@application/audit';
import type { AuditRepository } from '@application/audit';
import { ID_GENERATOR } from '@application/shared';
import type { IdGenerator } from '@domain/shared';
import { DrizzleAuditRepository } from '@adapter/outbound/persistence/audit/drizzle-audit.repository';

/**
 * The `audit` module: the trail of every tool invocation.
 *
 * It exports the use case and nothing else. `audit` is **write-only** to every other module —
 * everybody writes, nobody reads from inside the flow — and a module that exported its repository
 * would be inviting the read that the rule exists to prevent
 * (docs/architecture/backend/03-modules.md#audit).
 */
@Module({
  providers: [
    { provide: AUDIT_REPOSITORY, useClass: DrizzleAuditRepository },
    {
      provide: RecordToolInvocationUseCase,
      inject: [AUDIT_REPOSITORY, ID_GENERATOR],
      useFactory: (entries: AuditRepository, ids: IdGenerator) =>
        new RecordToolInvocationUseCase(entries, ids),
    },
  ],
  exports: [RecordToolInvocationUseCase],
})
export class AuditModule {}
