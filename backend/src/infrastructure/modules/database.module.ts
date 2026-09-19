import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type pg from 'pg';

import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { openDatabase } from '../database/connection';
import type { Database, DatabaseConnection } from '../database/connection';
import { PERSISTENCE_CONTEXT } from '../database/persistence-context';
import type { PersistenceContext } from '../database/persistence-context';
import { DATABASE, DATABASE_CONNECTION, DATABASE_POOL } from '../database/database.tokens';
import { migrate } from '../database/migrator';

/**
 * Applies the migrations on the way up, behind an advisory lock, and drains the pool on the way
 * down.
 *
 * A failure here stops the boot. A backend that starts on an unmigrated schema serves errors that
 * look like bugs — starting degraded is worse than not starting at all.
 */
@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: pg.Pool,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    const applied = await migrate(this.pool);

    this.logger.info(
      { op: 'db.migrate', layer: 'infrastructure', applied: applied.length },
      'migrations applied',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => openDatabase(config.databaseUrl),
    },
    {
      provide: DATABASE_POOL,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) => connection.pool,
    },
    {
      provide: DATABASE,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) => connection.db,
    },
    {
      provide: PERSISTENCE_CONTEXT,
      inject: [DATABASE, CLOCK, LOGGER],
      useFactory: (db: Database, clock: Clock, logger: Logger): PersistenceContext => ({
        db,
        clock,
        logger,
      }),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE, DATABASE_POOL, PERSISTENCE_CONTEXT],
})
export class DatabaseModule {}
