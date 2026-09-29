import { Module } from '@nestjs/common';

import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { GracefulShutdown } from '../lifecycle/graceful-shutdown';
import { OrphanSweep } from '../lifecycle/orphan-sweep';
import { PidFile } from '../lifecycle/pid-file';
import { ProcfsProcessTable } from '../lifecycle/process-table';
import { GatewayModule } from './gateway.module';
import { SessionModule } from './session.module';

/**
 * The ends of the process's life that cross modules: the boot sweep for subprocesses a dead
 * backend left behind, the ordered shutdown (plan 05, B-03 and B-04), and the pid file the
 * development stack finds the process by (plan 06, B-11).
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
    {
      provide: PidFile,
      inject: [APP_CONFIG, LOGGER],
      useFactory: (config: AppConfig, logger: Logger) => new PidFile(config.pidFile, logger),
    },
  ],
})
export class LifecycleModule {}
