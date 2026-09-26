import { Module } from '@nestjs/common';

import type pg from 'pg';

import {
  AUDIT_EVENT_REPOSITORY,
  AUDIT_REPOSITORY,
  PurgeAuditTrailUseCase,
  RecordAuditEventUseCase,
  RecordToolInvocationUseCase,
} from '@application/audit';
import type { AuditEventRepository, AuditRepository } from '@application/audit';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { DrizzleAuditRepository } from '@adapter/outbound/persistence/audit/drizzle-audit.repository';
import { DrizzleAuditEventRepository } from '@adapter/outbound/persistence/audit/drizzle-audit-event.repository';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { createAuditPurge } from '../database/audit-purge';
import { DATABASE_POOL } from '../database/database.tokens';
import { AUDIT_PURGE_INTERVAL, AuditPurgeJob } from '../jobs/audit-purge.job';

/**
 * The `audit` module: the trail of every tool invocation, and of the account facts of the same
 * weight — registering, approving and revoking a device
 * (docs/architecture/shared/08-authentication.md#logging).
 *
 * It exports the two use cases and nothing else. `audit` is **write-only** to every other module —
 * everybody writes, nobody reads from inside the flow — and a module that exported its repository
 * would be inviting the read that the rule exists to prevent
 * (docs/architecture/backend/03-modules.md#audit).
 *
 * The retention purge lives here too, and is exported to nobody: the job that runs it is the only
 * consumer inside the process, and `pnpm db purge` assembles the same thing through
 * {@link createAuditPurge} outside it.
 */
@Module({
  providers: [
    { provide: AUDIT_REPOSITORY, useClass: DrizzleAuditRepository },
    { provide: AUDIT_EVENT_REPOSITORY, useClass: DrizzleAuditEventRepository },
    {
      provide: RecordToolInvocationUseCase,
      inject: [AUDIT_REPOSITORY, ID_GENERATOR],
      useFactory: (entries: AuditRepository, ids: IdGenerator) =>
        new RecordToolInvocationUseCase(entries, ids),
    },
    {
      provide: RecordAuditEventUseCase,
      inject: [AUDIT_EVENT_REPOSITORY, ID_GENERATOR],
      useFactory: (events: AuditEventRepository, ids: IdGenerator) =>
        new RecordAuditEventUseCase(events, ids),
    },
    {
      provide: PurgeAuditTrailUseCase,
      inject: [DATABASE_POOL, LOGGER, CLOCK, ID_GENERATOR, APP_CONFIG],
      useFactory: (
        pool: pg.Pool,
        logger: Logger,
        clock: Clock,
        ids: IdGenerator,
        config: AppConfig,
      ) =>
        createAuditPurge({ pool, logger, clock, ids, retentionDays: config.audit.retentionDays }),
    },
    {
      provide: AUDIT_PURGE_INTERVAL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => config.audit.purgeIntervalMs,
    },
    AuditPurgeJob,
  ],
  exports: [RecordToolInvocationUseCase, RecordAuditEventUseCase],
})
export class AuditModule {}
