import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { DatabaseProbe } from '@application/health';
import { DATABASE } from '@infra/database/database.tokens';
import type { Database } from '@infra/database/connection';
import { LOGGER, type Logger } from '@shared/logging/logger';

/**
 * `SELECT 1`, and nothing else.
 *
 * A health check that touches a business table starts reporting ill health for reasons that have
 * nothing to do with the database being up.
 */
@Injectable()
export class DrizzleDatabaseProbe implements DatabaseProbe {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async isReachable(): Promise<boolean> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return true;
    } catch (error) {
      // Swallowed on purpose — and logged, which is the half that makes it legitimate. The
      // caller wants a verdict, not an exception: an unreachable database is the answer.
      this.logger.error({ op: 'db.query', layer: 'adapter', err: error }, 'database unreachable');
      return false;
    }
  }
}
