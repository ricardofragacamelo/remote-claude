import { Module } from '@nestjs/common';

import { CheckHealthUseCase, DATABASE_PROBE } from '@application/health';
import type { DatabaseProbe } from '@application/health';
import { HealthController } from '@adapter/inbound/http/health/health.controller';
import { DrizzleDatabaseProbe } from '@adapter/outbound/persistence/health/drizzle-database.probe';

/** `GET /health`. No authentication: it is what the startup scripts poll. */
@Module({
  controllers: [HealthController],
  providers: [
    { provide: DATABASE_PROBE, useClass: DrizzleDatabaseProbe },
    {
      provide: CheckHealthUseCase,
      inject: [DATABASE_PROBE],
      useFactory: (probe: DatabaseProbe) => new CheckHealthUseCase(probe),
    },
  ],
})
export class HealthModule {}
