import { Global, Module } from '@nestjs/common';

import { CLOCK, ID_GENERATOR, SCHEDULER } from '@application/shared';
import { UlidGenerator } from '@shared/ids/ulid-generator';
import { createRootLogger, LOGGER } from '@shared/logging/logger';
import type { AppConfig } from '../config/environment';
import { APP_CONFIG, loadConfig } from '../config/environment';
import { SystemClock } from '@shared/time/system-clock';
import { SystemScheduler } from '@shared/time/system-scheduler';
import { processEnvironment } from '../config/process-environment';

/**
 * Configuration, clock, scheduler, identity and logging — the five things everything else needs.
 *
 * The configuration factory is what makes an invalid environment fatal: it throws, Nest fails to
 * build the container, and the process never reaches a state where it serves requests with a
 * silently defaulted setting.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig(processEnvironment()) },
    { provide: CLOCK, useClass: SystemClock },
    { provide: SCHEDULER, useClass: SystemScheduler },
    { provide: ID_GENERATOR, useClass: UlidGenerator },
    {
      provide: LOGGER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createRootLogger({ level: config.logLevel, service: 'backend' }),
    },
  ],
  exports: [APP_CONFIG, CLOCK, ID_GENERATOR, LOGGER, SCHEDULER],
})
export class PlatformModule {}
