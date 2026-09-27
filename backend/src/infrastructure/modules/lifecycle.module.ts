import { Module } from '@nestjs/common';

import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { GracefulShutdown } from '../lifecycle/graceful-shutdown';
import { OrphanSweep } from '../lifecycle/orphan-sweep';
import { ProcfsProcessTable } from '../lifecycle/process-table';
import { GatewayModule } from './gateway.module';
import { SessionModule } from './session.module';

/**
 * The two ends of the process's life that cross modules: the boot sweep for subprocesses a dead
 * backend left behind, and the ordered shutdown (plan 05, B-03 and B-04).
 */
@Module({
  imports: [GatewayModule, SessionModule],
  providers: [
    {
      provide: OrphanSweep,
      inject: [SCHEDULER, LOGGER],
      useFactory: (scheduler: Scheduler, logger: Logger) =>
        new OrphanSweep(new ProcfsProcessTable(), scheduler, logger),
    },
    GracefulShutdown,
  ],
})
export class LifecycleModule {}
